package com.wolffewrought.sectrack;

/*
 * A small WebView shell for the Security Access Tracker.
 *
 * The page is the app; this file exists for exactly three things a page
 * cannot do for itself on Android:
 *   1. keep a folder the person chose once, and write PDFs into it
 *   2. write to the phone's Downloads without a download manager
 *   3. open the file picker when the page asks for a restore file
 *
 * Deliberately absent: FLAG_SECURE. Screenshots work.
 */

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.documentfile.provider.DocumentFile;

import java.io.OutputStream;

public class MainActivity extends Activity {

    /* The page this shell hosts. Change to your published address. */
    private static final String BASE_URL = "https://wolffewrought.github.io/Sec-Track/";

    private static final int PICK_FOLDER = 41;
    private static final int PICK_FILE = 42;
    private static final String PREFS = "sectrack-shell";
    private static final String KEY_TREE = "treeUri";

    private WebView web;
    private ValueCallback<Uri[]> pendingFileChooser;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          /* localStorage is the app's memory */
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);

        web.addJavascriptInterface(new Saver(), "AndroidSaver");
        web.setWebViewClient(new WebViewClient());

        /* the page's own restore button uses <input type="file">, which a
           bare WebView ignores unless the chooser is carried by hand */
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
                pendingFileChooser = cb;
                try {
                    startActivityForResult(params.createIntent(), PICK_FILE);
                } catch (Exception e) {
                    pendingFileChooser = null;
                    cb.onReceiveValue(null);
                }
                return true;
            }
        });

        if (savedInstanceState == null) web.loadUrl(BASE_URL);
        else web.restoreState(savedInstanceState);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /* ---------------- results from the two pickers ---------------- */

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        super.onActivityResult(req, result, data);

        if (req == PICK_FILE) {
            if (pendingFileChooser != null) {
                pendingFileChooser.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(result, data));
                pendingFileChooser = null;
            }
            return;
        }

        if (req == PICK_FOLDER) {
            boolean ok = false;
            String label = "";
            if (result == RESULT_OK && data != null && data.getData() != null) {
                Uri tree = data.getData();
                /* the OS remembers the grant across reboots and updates;
                   the app only remembers which grant to use */
                getContentResolver().takePersistableUriPermission(tree,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION |
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                prefs().edit().putString(KEY_TREE, tree.toString()).apply();
                ok = true;
                DocumentFile d = DocumentFile.fromTreeUri(this, tree);
                if (d != null && d.getName() != null) label = d.getName();
            }
            call("app.folderPicked(" + ok + "," + quote(label) + ")");
        }
    }

    /* ---------------- the bridge the page sees ---------------- */

    private class Saver {

        @JavascriptInterface
        public boolean hasFolder() {
            return folder() != null;
        }

        @JavascriptInterface
        public String folderName() {
            DocumentFile d = folder();
            return d != null && d.getName() != null ? d.getName() : "";
        }

        @JavascriptInterface
        public void pickFolder() {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION |
                       Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
                       Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(i, PICK_FOLDER);
        }

        /* runs on the binder thread, which is the right place for I/O */
        @JavascriptInterface
        public void saveFile(String name, String base64) {
            boolean ok = false;
            try {
                DocumentFile dir = folder();
                if (dir != null) {
                    DocumentFile old = dir.findFile(name);
                    if (old != null) old.delete();
                    DocumentFile f = dir.createFile("application/pdf", name);
                    if (f != null) {
                        OutputStream out = getContentResolver().openOutputStream(f.getUri());
                        out.write(Base64.decode(base64, Base64.DEFAULT));
                        out.close();
                        ok = true;
                    }
                }
            } catch (Exception e) { /* reported below either way */ }
            call("app.fileSaved(" + quote(name) + "," + ok + ")");
        }

        @JavascriptInterface
        public void saveToDownloads(String name, String base64) {
            boolean ok = false;
            try {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                Uri row = getContentResolver()
                    .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (row != null) {
                    OutputStream out = getContentResolver().openOutputStream(row);
                    out.write(Base64.decode(base64, Base64.DEFAULT));
                    out.close();
                    ok = true;
                }
            } catch (Exception e) { /* reported below either way */ }
            call("app.fileSaved(" + quote(name) + "," + ok + ")");
        }
    }

    /* ---------------- small helpers ---------------- */

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private DocumentFile folder() {
        String u = prefs().getString(KEY_TREE, null);
        if (u == null) return null;
        DocumentFile d = DocumentFile.fromTreeUri(this, Uri.parse(u));
        /* the person can revoke the grant in Files; treat that as unset */
        return (d != null && d.canWrite()) ? d : null;
    }

    private void call(final String js) {
        runOnUiThread(new Runnable() {
            public void run() { web.evaluateJavascript(js, null); }
        });
    }

    private static String quote(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }
}
