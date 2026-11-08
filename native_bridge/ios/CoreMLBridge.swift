import Foundation
import CoreML
import Metal
import Darwin

public struct RetroactiveNLIEvent {
    public let acuId: String
    public let pContra, pNeutral, pEntail: Double
    public let vetoTripped: Bool
}

public protocol BottomQuarantineDrawerDelegate: AnyObject {
    func didStreamPendingACU(acuId: String, text: String, auditState: String)
    func didResolveRetroactiveNLI(event: RetroactiveNLIEvent)
}

public struct LabelIndexMap: Decodable {
    private struct RawMap: Decodable { let id2label: [String: String] }
    public let contraIdx: Int, neutralIdx: Int, entailIdx: Int

    public init(contraIdx: Int = 0, neutralIdx: Int = 1, entailIdx: Int = 2) {
        self.contraIdx = contraIdx; self.neutralIdx = neutralIdx; self.entailIdx = entailIdx
    }

    public static func load(from url: URL?) -> LabelIndexMap {
        guard let url, let data = try? Data(contentsOf: url),
              let parsed = try? JSONDecoder().decode(RawMap.self, from: data) else { return LabelIndexMap() }
        var c: Int?, n: Int?, e: Int?
        for (k, v) in parsed.id2label {
            guard let idx = Int(k) else { continue }
            let lbl = v.lowercased()
            if lbl.contains("contra") || lbl == "label_0" { c = idx }
            else if lbl.contains("neut") || lbl == "label_1" { n = idx }
            else if lbl.contains("entail") || lbl == "label_2" { e = idx }
        }
        guard let ci = c, let ni = n, let ei = e, Set([ci, ni, ei]).count == 3 else { return LabelIndexMap() }
        return LabelIndexMap(contraIdx: ci, neutralIdx: ni, entailIdx: ei)
    }
}

public final class WordPieceTokenizer {
    private let vocab: [String: Int32]
    private let clsId: Int32, sepId: Int32, unkId: Int32, padId: Int32
    private let maxLen: Int

    public init(vocabURL: URL, maxLen: Int = 128) throws {
        var map: [String: Int32] = [:]
        for (i, line) in try String(contentsOf: vocabURL, encoding: .utf8).split(separator: "\n").enumerated() {
            map[String(line)] = Int32(i)
        }
        self.vocab = map
        self.clsId = map["[CLS]"] ?? 101; self.sepId = map["[SEP]"] ?? 102
        self.unkId = map["[UNK]"] ?? 100; self.padId = map["[PAD]"] ?? 0
        self.maxLen = maxLen
    }

    private func basicSplit(_ text: String) -> [String] {
        var out: [String] = [], cur = ""
        for ch in text.lowercased() {
            if ch.isWhitespace {
                if !cur.isEmpty { out.append(cur); cur = "" }
            } else if !ch.isLetter && !ch.isNumber {
                if !cur.isEmpty { out.append(cur); cur = "" }
                out.append(String(ch))
            } else { cur.append(ch) }
        }
        if !cur.isEmpty { out.append(cur) }
        return out
    }

    private func tokenize(_ text: String) -> [Int32] {
        var ids: [Int32] = []
        for word in basicSplit(text) {
            if let hit = vocab[word] { ids.append(hit); continue }
            var start = word.startIndex, parts: [Int32] = [], ok = true
            while start < word.endIndex {
                var end = word.endIndex, found: Int32?
                while start < end {
                    let key = (start == word.startIndex ? "" : "##") + String(word[start..<end])
                    if let id = vocab[key] { found = id; break }
                    end = word.index(before: end)
                }
                guard let id = found else { ok = false; break }
                parts.append(id); start = end
            }
            ids.append(contentsOf: ok ? parts : [unkId])
        }
        return ids
    }

    public func encodePair(premise: String, hypothesis: String) -> (inputIds: [Int32], attentionMask: [Int32]) {
        var ids: [Int32] = [clsId]
        ids.append(contentsOf: tokenize(premise).prefix((maxLen - 3) / 2))
        ids.append(sepId)
        ids.append(contentsOf: tokenize(hypothesis).prefix(max(0, maxLen - ids.count - 1)))
        ids.append(sepId)
        if ids.count > maxLen { ids = Array(ids.prefix(maxLen)) }
        var mask = Array(repeating: Int32(1), count: ids.count)
        while ids.count < maxLen { ids.append(padId); mask.append(0) }
        return (ids, mask)
    }
}

public final class AlphaCoreMLEngine {
    private var llmModel: MLModel?, nliModel: MLModel?, tokenizer: WordPieceTokenizer?
    private var labelMap = LabelIndexMap()
    private var mappedWeightsData: NSData?, sharedScratchpadHeap: MTLHeap?
    private let arenaBytes = 225 * 1024 * 1024
    private let asyncQueue = DispatchQueue(label: "ai.alpha.shared_arena.nli", qos: .userInitiated)
    public weak var drawerDelegate: BottomQuarantineDrawerDelegate?

    public init() {}
    public func availableMemoryMB() -> Int { Int(os_proc_available_memory() / (1024 * 1024)) }

    public func initializeSharedArena(llmURL: URL, nliURL: URL, vocabURL: URL, rawWeightsURL: URL, labelMapURL: URL? = nil) throws {
        let freeMB = availableMemoryMB()
        guard freeMB >= 2200 else {
            throw NSError(domain: "AlphaCoreMLEngine", code: 507, userInfo: [NSLocalizedDescriptionKey: "Low Jetsam RAM: \(freeMB)MB"])
        }
        mappedWeightsData = try NSData(contentsOf: rawWeightsURL, options: .mappedIfSafe)
        tokenizer = try WordPieceTokenizer(vocabURL: vocabURL, maxLen: 128)
        labelMap = LabelIndexMap.load(from: labelMapURL)
        if let dev = MTLCreateSystemDefaultDevice() {
            let desc = MTLHeapDescriptor(); desc.size = arenaBytes; desc.storageMode = .shared
            sharedScratchpadHeap = dev.makeHeap(descriptor: desc)
        }
        let cfg = MLModelConfiguration(); cfg.computeUnits = .all
        llmModel = try MLModel(contentsOf: llmURL, configuration: cfg)
        nliModel = try MLModel(contentsOf: nliURL, configuration: cfg)
    }

    public func streamAndAuditACU(acuId: String, premise: String, hypothesis: String, requiresNLI: Bool) {
        drawerDelegate?.didStreamPendingACU(acuId: acuId, text: hypothesis, auditState: requiresNLI ? "PENDING_AUDIT" : "BYPASSED_LOW_RISK")
        guard requiresNLI else { return }
        asyncQueue.async { [weak self] in
            guard let self, let nli = self.nliModel, let tok = self.tokenizer else { return }
            let enc = tok.encodePair(premise: premise, hypothesis: hypothesis)
            guard let ids = try? MLMultiArray(shape: [1, 128], dataType: .int32),
                  let mask = try? MLMultiArray(shape: [1, 128], dataType: .int32) else { return }
            for i in 0..<128 { ids[i] = NSNumber(value: enc.inputIds[i]); mask[i] = NSNumber(value: enc.attentionMask[i]) }
            guard let feat = try? MLDictionaryFeatureProvider(dictionary: ["input_ids": MLFeatureValue(multiArray: ids), "attention_mask": MLFeatureValue(multiArray: mask)]),
                  let out = try? nli.prediction(from: feat),
                  let logits = out.featureValue(for: "logits")?.multiArrayValue else { return }
            let raw = [logits[self.labelMap.contraIdx].doubleValue, logits[self.labelMap.neutralIdx].doubleValue, logits[self.labelMap.entailIdx].doubleValue]
            let m = raw.max() ?? 0, exps = raw.map { exp($0 - m) }, s = exps.reduce(0, +), p = exps.map { $0 / s }
            let ev = RetroactiveNLIEvent(acuId: acuId, pContra: p[0], pNeutral: p[1], pEntail: p[2], vetoTripped: p[0] >= 0.35)
            DispatchQueue.main.async { self.drawerDelegate?.didResolveRetroactiveNLI(event: ev) }
        }
    }

    public func releaseArena() { llmModel = nil; nliModel = nil; tokenizer = nil; mappedWeightsData = nil; sharedScratchpadHeap = nil }
}
