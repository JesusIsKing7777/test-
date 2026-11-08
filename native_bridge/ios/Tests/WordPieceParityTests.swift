import XCTest
import Foundation

final class WordPieceParityTests: XCTestCase {
    private func makeTempFile(name: String, content: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "_" + name)
        try content.write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    func testSubwordHashSplittingAndEncodePair() throws {
        let vocabLines = [
            "[PAD]", "[UNK]", "[CLS]", "[SEP]",
            "un", "##safe", "llama", "-", "3", "can", "'", "t",
            "500", "child", "_", "process", "workers", "fail", "##ing"
        ]
        let vocabURL = try makeTempFile(name: "vocab.txt", content: vocabLines.joined(separator: "\n"))
        defer { try? FileManager.default.removeItem(at: vocabURL) }

        let tok = try WordPieceTokenizer(vocabURL: vocabURL, maxLen: 16)
        let encoded = tok.encodePair(
            premise: "Can't fail",
            hypothesis: "Llama-3 unsafe failing"
        )

        // Expected IDs:
        // [CLS]=2, can=9, '=10, t=11, fail=17, [SEP]=3,
        // llama=6, -=7, 3=8, un=4, ##safe=5, fail=17, ##ing=18, [SEP]=3, [PAD]=0, [PAD]=0
        let expectedIds: [Int32] = [2, 9, 10, 11, 17, 3, 6, 7, 8, 4, 5, 17, 18, 3, 0, 0]
        let expectedMask: [Int32] = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0]

        XCTAssertEqual(encoded.inputIds, expectedIds)
        XCTAssertEqual(encoded.attentionMask, expectedMask)
    }

    func testDynamicLabelIndexMapPreventsIndexSwap() throws {
        let json = #"{"id2label": {"0": "contradiction", "1": "entailment", "2": "neutral"}}"#
        let mapURL = try makeTempFile(name: "label_map.json", content: json)
        defer { try? FileManager.default.removeItem(at: mapURL) }

        let map = LabelIndexMap.load(from: mapURL)
        XCTAssertEqual(map.contraIdx, 0)
        XCTAssertEqual(map.neutralIdx, 2)
        XCTAssertEqual(map.entailIdx, 1)
    }

    func testParityVectorsFileIntegrity() throws {
        let path = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appendingPathComponent("models/tokenizer_parity_vectors.json")
        guard FileManager.default.fileExists(atPath: path.path) else { return }
        let data = try Data(contentsOf: path)
        let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        XCTAssertEqual(rows?.count, 20)
    }
}
