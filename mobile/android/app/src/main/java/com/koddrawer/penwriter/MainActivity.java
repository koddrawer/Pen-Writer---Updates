package com.koddrawer.penwriter;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

// Màn hình luôn sáng, toàn màn hình (ẩn thanh trạng thái/điều hướng) để TikTok chia sẻ màn hình thu được hình sạch
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        try {
            WebSettings s = getBridge().getWebView().getSettings();
            s.setMediaPlaybackRequiresUserGesture(false);
        } catch (Exception ignored) { }
        hideSystemUI();
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
}
