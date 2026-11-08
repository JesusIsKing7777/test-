package ai.alpha.bridge

import android.app.ActivityManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

data class RetroactiveNliVerdict(val acuId: String, val pContra: Double, val pNeutral: Double, val pEntail: Double, val vetoTripped: Boolean, val backend: String)

interface BottomQuarantineDrawerListener {
    fun onAcuStreamed(acuId: String, text: String, auditState: String)
    fun onAcuNliResolved(verdict: RetroactiveNliVerdict)
}

class AlphaExecuTorchBridge(private val context: Context) {
    companion object {
        init { System.loadLibrary("alpha_mmap_arena") }
        private const val MIN_LMKD_HEADROOM_MB = 400L
        private const val CONTRADICTION_VETO = 0.35
    }

    private external fun nativeInitMmapArena(weightsPath: String): Long
    private external fun nativeInitNliModel(handle: Long, onnxPath: String, vocabPath: String, labelIdx: IntArray): Boolean
    private external fun nativeScoreNli(handle: Long, premise: String, hypothesis: String): DoubleArray
    private external fun nativeReleaseMmapArena(arenaHandle: Long)

    private var arenaHandle: Long = 0L
    private val worker = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    var drawerListener: BottomQuarantineDrawerListener? = null

    fun availableSystemRamMb(): Long {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val info = ActivityManager.MemoryInfo()
        am.getMemoryInfo(info)
        return info.availMem / (1024L * 1024L)
    }

    private fun parseLabelIndices(labelMapPath: String?): IntArray {
        if (labelMapPath.isNullOrBlank()) return intArrayOf(0, 1, 2)
        return try {
            val id2l = JSONObject(File(labelMapPath).readText()).getJSONObject("id2label")
            var c = 0; var n = 1; var e = 2
            id2l.keys().forEach { k ->
                val idx = k.toInt(); val v = id2l.getString(k).lowercase()
                when { "contra" in v || v == "label_0" -> c = idx; "neut" in v || v == "label_1" -> n = idx; "entail" in v || v == "label_2" -> e = idx }
            }
            intArrayOf(c, n, e)
        } catch (_: Exception) { intArrayOf(0, 1, 2) }
    }

    fun initializeArena(ptePath: String, onnxPath: String? = null, vocabPath: String? = null, labelMapPath: String? = null): Boolean {
        if (availableSystemRamMb() < MIN_LMKD_HEADROOM_MB) return false
        arenaHandle = nativeInitMmapArena(ptePath)
        if (arenaHandle != 0L && onnxPath != null && vocabPath != null) {
            nativeInitNliModel(arenaHandle, onnxPath, vocabPath, parseLabelIndices(labelMapPath))
        }
        return arenaHandle != 0L
    }

    fun streamAndAuditAcu(acuId: String, premise: String, hypothesis: String, requiresNli: Boolean) {
        drawerListener?.onAcuStreamed(acuId, hypothesis, if (requiresNli) "PENDING_AUDIT" else "BYPASSED_LOW_RISK")
        if (!requiresNli || arenaHandle == 0L) return
        worker.execute {
            val s = nativeScoreNli(arenaHandle, premise, hypothesis)
            val verdict = RetroactiveNliVerdict(acuId, s[0], s[1], s[2], s[0] >= CONTRADICTION_VETO, if (s[3] >= 0.5) "ANDROID_NDK_ORT" else "NDK_FALLBACK")
            mainHandler.post { drawerListener?.onAcuNliResolved(verdict) }
        }
    }

    fun shutdown() { worker.shutdown(); if (arenaHandle != 0L) { nativeReleaseMmapArena(arenaHandle); arenaHandle = 0L } }
}
