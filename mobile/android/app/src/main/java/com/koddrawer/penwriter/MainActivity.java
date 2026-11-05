package com.koddrawer.penwriter;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.WebViewListener;
import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

// Màn hình luôn sáng, toàn màn hình (ẩn thanh trạng thái/điều hướng) để TikTok chia sẻ màn hình thu được hình sạch
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // ghi lại lỗi Java làm app tắt đột ngột -> lõi Node đọc và đưa vào nhật ký ở lần mở sau
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            StringWriter sw = new StringWriter(); e.printStackTrace(new PrintWriter(sw));
            note("crash-java.txt", "Thread " + t.getName() + ": " + sw);
            if (prev != null) prev.uncaughtException(t, e);
        });
        super.onCreate(savedInstanceState);
        // WebView (màn hiển thị) bị hệ thống tắt vì thiếu RAM/GPU: mặc định Capacitor để app văng ra.
        // Ở đây ghi lại rồi tự mở lại app sau 1 giây.
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                boolean crashed = detail != null && detail.didCrash();
                note("crash-webview.txt", crashed ? "WebView bị lỗi (crash)" : "WebView bị hệ thống tắt (thiếu bộ nhớ)");
                restartApp();
                return true;
            }
        });
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        try {
            WebSettings s = getBridge().getWebView().getSettings();
            s.setMediaPlaybackRequiresUserGesture(false);
        } catch (Exception ignored) { }
        hideSystemUI();
        // nút Back: đóng bảng điều khiển nếu đang mở, không thì đưa app xuống nền (không tắt app giữa buổi live)
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                try {
                    getBridge().getWebView().evaluateJavascript(
                        "(function(){var p=window.__mpanel;if(p&&p.el&&p.el.classList.contains('on')){p.close();return 1}return 0})()",
                        r -> { if (!"1".equals(r)) moveTaskToBack(true); });
                } catch (Exception e) { moveTaskToBack(true); }
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    private void hideSystemUI() {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    private void note(String name, String text) {
        try (FileWriter w = new FileWriter(new File(getFilesDir(), name), true)) { w.write(new java.util.Date() + " " + text + "\n"); } catch (Exception ignored) { }
    }

    private void restartApp() {
        try {
            Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            PendingIntent pi = PendingIntent.getActivity(this, 1, i, PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            am.set(AlarmManager.RTC, System.currentTimeMillis() + 1000, pi);
        } catch (Exception ignored) { }
        finishAffinity();
        android.os.Process.killProcess(android.os.Process.myPid());
    }
}
