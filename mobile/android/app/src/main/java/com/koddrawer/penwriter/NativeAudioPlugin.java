package com.koddrawer.penwriter;

import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashMap;
import java.util.Map;

// Phát nhạc nền / voice / truyện bằng MediaPlayer của Android (USAGE_MEDIA) thay cho <audio> của WebView,
// để TikTok (live chia sẻ màn hình) thu được âm thanh của app giống như YouTube.
@CapacitorPlugin(name = "NativeAudio")
public class NativeAudioPlugin extends Plugin {
    private static class P {
        MediaPlayer mp; boolean prepared, wantPlay; float vol = 1f, rate = 1f; int seekMs = -1; String url;
    }
    private final Map<String, P> players = new HashMap<>();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            for (Map.Entry<String, P> e : players.entrySet()) {
                P p = e.getValue();
                try { if (p.prepared && p.mp.isPlaying()) emit(e.getKey(), "time", p.mp.getCurrentPosition() / 1000.0, -1); } catch (Exception ignored) { }
            }
            ui.postDelayed(this, 1000);
        }
    };

    @Override
    public void load() { ui.postDelayed(ticker, 1000); }

    private void emit(String id, String type, double t, double dur) {
        JSObject o = new JSObject();
        o.put("id", id); o.put("type", type);
        if (t >= 0) o.put("t", t);
        if (dur >= 0) o.put("dur", dur);
        notifyListeners("audio", o);
    }

    private void applyRate(P p) {
        if (Build.VERSION.SDK_INT < 23 || Math.abs(p.rate - 1f) < 0.001f) return;
        try { p.mp.setPlaybackParams(new PlaybackParams().setSpeed(p.rate)); } catch (Exception ignored) { }
    }

    private void start(String id, P p) {
        try {
            if (p.seekMs >= 0) { p.mp.seekTo(p.seekMs); p.seekMs = -1; }
            p.mp.setVolume(p.vol, p.vol);
            p.mp.start(); applyRate(p);
            emit(id, "playing", p.mp.getCurrentPosition() / 1000.0, -1);
        } catch (Exception e) { emit(id, "error", -1, -1); }
    }

    @PluginMethod
    public void src(PluginCall call) {
        final String id = call.getString("id"), url = call.getString("url");
        ui.post(() -> {
            P old = players.remove(id);
            if (old != null) { try { old.mp.release(); } catch (Exception ignored) { } }
            if (url == null || url.isEmpty()) { call.resolve(); return; }
            final P p = new P(); p.url = url; p.mp = new MediaPlayer();
            if (old != null) { p.vol = old.vol; p.rate = old.rate; }
            players.put(id, p);
            try {
                AudioAttributes.Builder ab = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC);
                if (Build.VERSION.SDK_INT >= 29) ab.setAllowedCapturePolicy(AudioAttributes.ALLOW_CAPTURE_BY_ALL);   // cho app khác (TikTok) thu tiếng
                p.mp.setAudioAttributes(ab.build());
                p.mp.setDataSource(url);
                p.mp.setOnPreparedListener(m -> {
                    if (players.get(id) != p) return;
                    p.prepared = true;
                    emit(id, "loadedmetadata", 0, m.getDuration() > 0 ? m.getDuration() / 1000.0 : 0);
                    if (p.wantPlay) start(id, p);
                });
                p.mp.setOnCompletionListener(m -> { if (players.get(id) == p) emit(id, "ended", -1, -1); });
                p.mp.setOnErrorListener((m, what, extra) -> { if (players.get(id) == p) emit(id, "error", -1, -1); return true; });
                p.mp.prepareAsync();
                call.resolve();
            } catch (Exception e) { emit(id, "error", -1, -1); call.resolve(); }
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        final String id = call.getString("id");
        ui.post(() -> { P p = players.get(id); if (p == null) { call.reject("no src"); return; } p.wantPlay = true; if (p.prepared) start(id, p); call.resolve(); });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        final String id = call.getString("id");
        ui.post(() -> {
            P p = players.get(id);
            if (p != null) { p.wantPlay = false; try { if (p.prepared && p.mp.isPlaying()) p.mp.pause(); if (p.prepared) emit(id, "pause", p.mp.getCurrentPosition() / 1000.0, -1); } catch (Exception ignored) { } }
            call.resolve();
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        final String id = call.getString("id"); final double t = call.getDouble("t", 0.0);
        ui.post(() -> { P p = players.get(id); if (p != null) { int ms = (int) Math.max(0, t * 1000); if (p.prepared) { try { p.mp.seekTo(ms); } catch (Exception ignored) { } } else p.seekMs = ms; } call.resolve(); });
    }

    @PluginMethod
    public void volume(PluginCall call) {
        final String id = call.getString("id"); final float v = (float) Math.max(0, Math.min(1, call.getDouble("v", 1.0)));
        ui.post(() -> { P p = players.get(id); if (p != null) { p.vol = v; try { p.mp.setVolume(v, v); } catch (Exception ignored) { } } call.resolve(); });
    }

    @PluginMethod
    public void rate(PluginCall call) {
        final String id = call.getString("id"); final float r = (float) Math.max(0.5, Math.min(2, call.getDouble("r", 1.0)));
        ui.post(() -> { P p = players.get(id); if (p != null) { p.rate = r; try { if (p.prepared && p.mp.isPlaying()) applyRate(p); } catch (Exception ignored) { } } call.resolve(); });
    }

    @Override
    protected void handleOnDestroy() {
        ui.removeCallbacks(ticker);
        for (P p : players.values()) { try { p.mp.release(); } catch (Exception ignored) { } }
        players.clear();
    }
}
