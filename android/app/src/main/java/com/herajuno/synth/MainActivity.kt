package com.herajuno.synth

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.*
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.FileOutputStream

class MainActivity : ComponentActivity() {

    private val TAG = "HeraJuno"
    private var webView: WebView? = null
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSaveContent: String? = null
    private var pendingSaveFilename: String? = null

    // Native Android USB / Bluetooth MIDI Bridge state
    private var androidMidiManager: MidiManager? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val openedMidiDevices = mutableMapOf<Int, MidiDevice>()
    private val openedOutputPorts = mutableListOf<MidiOutputPort>()
    private val connectedDeviceNames = mutableMapOf<Int, String>()

    private val midiDeviceCallback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(device: MidiDeviceInfo?) {
            device?.let { openMidiDevice(it) }
        }

        override fun onDeviceRemoved(device: MidiDeviceInfo?) {
            device?.let { info ->
                connectedDeviceNames.remove(info.id)
                openedMidiDevices.remove(info.id)?.let { dev ->
                    try {
                        dev.close()
                    } catch (e: Exception) {
                        Log.w(TAG, "Error closing removed MIDI device", e)
                    }
                }
                notifyWebViewMidiDevices()
            }
        }
    }

    // Launcher for <input type="file"> (Load Preset XML)
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = fileUploadCallback
        fileUploadCallback = null
        if (callback == null) return@registerForActivityResult

        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val dataUri = result.data?.data
            val clipData = result.data?.clipData
            val uris = mutableListOf<Uri>()
            if (dataUri != null) {
                uris.add(dataUri)
            } else if (clipData != null) {
                for (i in 0 until clipData.itemCount) {
                    clipData.getItemAt(i)?.uri?.let { uris.add(it) }
                }
            }
            callback.onReceiveValue(uris.toTypedArray())
        } else {
            callback.onReceiveValue(null)
        }
    }

    // Launcher for Export / Download Preset XML (Intent.ACTION_CREATE_DOCUMENT)
    private val createDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val content = pendingSaveContent
        val fallbackName = pendingSaveFilename ?: "Hera_Preset.xml"
        pendingSaveContent = null
        pendingSaveFilename = null

        if (result.resultCode == Activity.RESULT_OK && content != null) {
            val uri = result.data?.data
            if (uri != null) {
                try {
                    contentResolver.openOutputStream(uri)?.use { out ->
                        out.write(content.toByteArray(Charsets.UTF_8))
                        out.flush()
                    }
                    Toast.makeText(this, "Preset salvo com sucesso!", Toast.LENGTH_SHORT).show()
                    return@registerForActivityResult
                } catch (e: Exception) {
                    Log.e(TAG, "Error writing to document URI", e)
                }
            }
            // Fallback to Downloads if URI write failed
            saveDirectlyToDownloads(fallbackName, content)
        }
    }

    private fun saveDirectlyToDownloads(filename: String, content: String): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, filename)
                    put(MediaStore.Downloads.MIME_TYPE, "application/xml")
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                if (uri != null) {
                    contentResolver.openOutputStream(uri)?.use { out ->
                        out.write(content.toByteArray(Charsets.UTF_8))
                        out.flush()
                    }
                    runOnUiThread {
                        Toast.makeText(this, "Salvo em Downloads: $filename", Toast.LENGTH_SHORT).show()
                    }
                    return true
                }
            }
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()
            val outFile = File(downloadsDir, filename)
            FileOutputStream(outFile).use { out ->
                out.write(content.toByteArray(Charsets.UTF_8))
                out.flush()
            }
            runOnUiThread {
                Toast.makeText(this, "Salvo em Downloads: $filename", Toast.LENGTH_SHORT).show()
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "Fallback saveDirectlyToDownloads failed", e)
            false
        }
    }

    private fun initNativeAndroidMidi() {
        try {
            val mgr = getSystemService(Context.MIDI_SERVICE) as? MidiManager ?: return
            this.androidMidiManager = mgr
            mgr.registerDeviceCallback(midiDeviceCallback, mainHandler)
            for (info in mgr.devices) {
                openMidiDevice(info)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Native Android MidiManager initialization error", e)
        }
    }

    private fun openMidiDevice(info: MidiDeviceInfo) {
        try {
            val mgr = androidMidiManager ?: return
            if (openedMidiDevices.containsKey(info.id)) return

            val props = info.properties
            val name = props.getString(MidiDeviceInfo.PROPERTY_NAME)
                ?: props.getString(MidiDeviceInfo.PROPERTY_PRODUCT)
                ?: "MIDI Controller ${info.id}"

            mgr.openDevice(info, { device ->
                if (device == null) return@openDevice
                openedMidiDevices[info.id] = device
                connectedDeviceNames[info.id] = name

                // Open ALL output ports (e.g., Launchkey MK4 MIDI port + DAW port)
                for (portInfo in info.ports) {
                    if (portInfo.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT) {
                        try {
                            val outputPort = device.openOutputPort(portInfo.portNumber)
                            if (outputPort != null) {
                                openedOutputPorts.add(outputPort)
                                outputPort.connect(object : MidiReceiver() {
                                    override fun onSend(
                                        msg: ByteArray?,
                                        offset: Int,
                                        count: Int,
                                        timestamp: Long
                                    ) {
                                        if (msg == null || count <= 0) return
                                        val sb = StringBuilder(count * 4)
                                        for (i in 0 until count) {
                                            if (i > 0) sb.append(',')
                                            sb.append(msg[offset + i].toInt() and 0xFF)
                                        }
                                        val payload = sb.toString()
                                        mainHandler.post {
                                            webView?.evaluateJavascript(
                                                "window.__onAndroidNativeMidi && window.__onAndroidNativeMidi([$payload]);",
                                                null
                                            )
                                        }
                                    }
                                })
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed to open MIDI output port ${portInfo.portNumber}", e)
                        }
                    }
                }
                notifyWebViewMidiDevices()
            }, mainHandler)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to open MIDI device", e)
        }
    }

    private fun notifyWebViewMidiDevices() {
        mainHandler.post {
            try {
                val escapedNames = connectedDeviceNames.values.joinToString(",") { raw ->
                    val safe = raw.replace("\\", "\\\\").replace("\"", "\\\"")
                    "\"$safe\""
                }
                webView?.evaluateJavascript(
                    "window.__onAndroidNativeMidiDevices && window.__onAndroidNativeMidiDevices([$escapedNames]);",
                    null
                )
            } catch (e: Exception) {
                Log.w(TAG, "Error notifying WebView of MIDI devices", e)
            }
        }
    }

    inner class AndroidHostBridge {
        @JavascriptInterface
        fun saveTextFile(filename: String, content: String, mimeType: String): Boolean {
            return try {
                pendingSaveFilename = filename
                pendingSaveContent = content
                runOnUiThread {
                    try {
                        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = if (mimeType.isNotBlank()) mimeType else "application/xml"
                            putExtra(Intent.EXTRA_TITLE, filename)
                        }
                        createDocumentLauncher.launch(intent)
                    } catch (e: Exception) {
                        Log.w(TAG, "ACTION_CREATE_DOCUMENT unavailable, saving directly to Downloads", e)
                        saveDirectlyToDownloads(filename, content)
                    }
                }
                true
            } catch (e: Exception) {
                Log.e(TAG, "Error in saveTextFile bridge", e)
                saveDirectlyToDownloads(filename, content)
            }
        }

        @JavascriptInterface
        fun refreshMidiDevices() {
            mainHandler.post {
                try {
                    androidMidiManager?.devices?.forEach { openMidiDevice(it) }
                    notifyWebViewMidiDevices()
                } catch (e: Exception) {
                    Log.w(TAG, "Error in refreshMidiDevices", e)
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            // Keep screen on during live synthesizer performance
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            window.setBackgroundDrawableResource(android.R.color.black)

            // Setup secure local asset loader for Vite ES modules & Web Audio
            val assetLoader = WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
                .build()

            val wv = WebView(this).apply {
                setBackgroundColor(Color.BLACK)

                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    mediaPlaybackRequiresUserGesture = false
                    allowFileAccess = true
                    allowContentAccess = true
                    setSupportZoom(false)
                    builtInZoomControls = false
                    displayZoomControls = false
                    useWideViewPort = true
                    loadWithOverviewMode = true
                    cacheMode = WebSettings.LOAD_DEFAULT

                    // Allow local scripts to access local files if fallback to file:// is used
                    @Suppress("DEPRECATION")
                    allowFileAccessFromFileURLs = true
                    @Suppress("DEPRECATION")
                    allowUniversalAccessFromFileURLs = true
                }

                // Enable OpenGL hardware acceleration
                setLayerType(View.LAYER_TYPE_HARDWARE, null)

                // Register native bridge for Preset XML Export/Download & Native MIDI
                addJavascriptInterface(AndroidHostBridge(), "AndroidHost")

                webChromeClient = object : WebChromeClient() {
                    override fun onPermissionRequest(request: PermissionRequest?) {
                        try {
                            request?.grant(request.resources)
                        } catch (e: Exception) {
                            Log.e(TAG, "Permission request error", e)
                        }
                    }

                    override fun onShowFileChooser(
                        webView: WebView?,
                        filePathCallback: ValueCallback<Array<Uri>>?,
                        fileChooserParams: FileChooserParams?
                    ): Boolean {
                        return try {
                            fileUploadCallback?.onReceiveValue(null)
                            fileUploadCallback = filePathCallback

                            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                                addCategory(Intent.CATEGORY_OPENABLE)
                                type = "*/*"
                                putExtra(
                                    Intent.EXTRA_MIME_TYPES,
                                    arrayOf("text/xml", "application/xml", "application/json", "text/plain", "*/*")
                                )
                            }
                            fileChooserLauncher.launch(Intent.createChooser(intent, "Carregar Preset (.XML)"))
                            true
                        } catch (e: Exception) {
                            Log.e(TAG, "File chooser error", e)
                            fileUploadCallback = null
                            false
                        }
                    }

                    override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                        consoleMessage?.let {
                            Log.d(TAG, "[WebConsole] ${it.message()} (line ${it.lineNumber()})")
                        }
                        return true
                    }
                }

                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(
                        view: WebView,
                        request: WebResourceRequest
                    ): WebResourceResponse? {
                        return assetLoader.shouldInterceptRequest(request.url)
                    }

                    override fun onReceivedError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        error: WebResourceError?
                    ) {
                        super.onReceivedError(view, request, error)
                        Log.e(TAG, "WebView load error: ${error?.description} for ${request?.url}")
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        Log.i(TAG, "Hera Juno Synthesizer loaded successfully: $url")
                        notifyWebViewMidiDevices()
                    }
                }
            }

            this.webView = wv
            setContentView(wv)

            // Initialize Native Android USB / BLE MIDI Bridge
            initNativeAndroidMidi()

            // Load via secure asset loader (enables ES Modules & Web Audio with zero CORS issues)
            wv.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        } catch (e: Throwable) {
            Log.e(TAG, "Fatal error initializing MainActivity", e)
        }
    }

    private fun hideSystemUI() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.insetsController?.let { controller ->
                    controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                    controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            } else {
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = (
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Non-fatal error in hideSystemUI", e)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemUI()
        }
    }

    override fun onResume() {
        super.onResume()
        try {
            webView?.onResume()
            androidMidiManager?.devices?.forEach { openMidiDevice(it) }
            notifyWebViewMidiDevices()
        } catch (e: Exception) {
            Log.e(TAG, "Error in onResume", e)
        }
    }

    override fun onPause() {
        super.onPause()
        try {
            webView?.onPause()
        } catch (e: Exception) {
            Log.e(TAG, "Error in onPause", e)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            androidMidiManager?.unregisterDeviceCallback(midiDeviceCallback)
            for (port in openedOutputPorts) {
                try {
                    port.close()
                } catch (_: Exception) {}
            }
            openedOutputPorts.clear()
            for (dev in openedMidiDevices.values) {
                try {
                    dev.close()
                } catch (_: Exception) {}
            }
            openedMidiDevices.clear()
            connectedDeviceNames.clear()
            webView?.destroy()
            webView = null
        } catch (e: Exception) {
            Log.e(TAG, "Error in onDestroy", e)
        }
    }
}
