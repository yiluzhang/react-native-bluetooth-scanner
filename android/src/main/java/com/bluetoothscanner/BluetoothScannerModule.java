package com.bluetoothscanner;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.HashMap;
import java.util.Map;

public class BluetoothScannerModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private final BluetoothAdapter bluetoothAdapter;
    private final Map<String, DeviceCache> deviceCache = new HashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final BroadcastReceiver receiver;

    private static final long REPORT_INTERVAL_MS = 1000;

    public BluetoothScannerModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();

        this.receiver = new BroadcastReceiver() {
            @SuppressLint("MissingPermission")
            @Override
            public void onReceive(Context context, Intent intent) {
                if (BluetoothDevice.ACTION_FOUND.equals(intent.getAction())) {
                    BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    int rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE);

                    if (device != null) {
                        String id = device.getAddress();
                        long now = System.currentTimeMillis();

                        DeviceCache cache = deviceCache.get(id);
                        if (cache == null) {
                            cache = new DeviceCache();
                            cache.id = id;
                            deviceCache.put(id, cache);
                        }

                        // 更新最新数据
                        cache.name = device.getName();
                        cache.type = device.getType();
                        cache.rssi = rssi;

                        long sinceLast = now - cache.lastSentTimestamp;

                        if (sinceLast > REPORT_INTERVAL_MS) {
                            cache.lastSentTimestamp = now;
                            sendDeviceEvent(cache);
                        } else {
                            if (cache.pendingRunnable != null) {
                                mainHandler.removeCallbacks(cache.pendingRunnable);
                            }

                            final DeviceCache finalCache = cache;
                            long delay = REPORT_INTERVAL_MS - sinceLast;
                            cache.pendingRunnable = new Runnable() {
                                @Override
                                public void run() {
                                    finalCache.lastSentTimestamp = System.currentTimeMillis();
                                    sendDeviceEvent(finalCache);
                                    finalCache.pendingRunnable = null;
                                }
                            };
                            mainHandler.postDelayed(cache.pendingRunnable, delay);
                        }
                    }
                }
            }
        };
    }

    @NonNull
    @Override
    public String getName() {
        return "BluetoothScanner";
    }

    @SuppressLint("MissingPermission")
    @ReactMethod
    public void startScan() {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            return;
        }

        IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_FOUND);
        reactContext.registerReceiver(receiver, filter);
        bluetoothAdapter.startDiscovery();
    }

    @SuppressLint("MissingPermission")
    @ReactMethod
    public void stopScan() {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            return;
        }

        if (bluetoothAdapter.isDiscovering()) {
            bluetoothAdapter.cancelDiscovery();
        }

        try {
            reactContext.unregisterReceiver(receiver);
        } catch (IllegalArgumentException e) {
            // Already unregistered
        }

        // 清理所有 pendingRunnable
        for (DeviceCache cache : deviceCache.values()) {
            if (cache.pendingRunnable != null) {
                mainHandler.removeCallbacks(cache.pendingRunnable);
            }
        }
        deviceCache.clear();
    }

    private void sendDeviceEvent(DeviceCache cache) {
        WritableMap map = new WritableNativeMap();
        map.putString("id", cache.id);
        map.putString("name", cache.name);
        map.putInt("type", cache.type);
        map.putInt("rssi", cache.rssi);
        sendEvent("onBluetoothDeviceFound", map);
    }

    private void sendEvent(String eventName, WritableMap map) {
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, map);
    }

    private static class DeviceCache {
        String id;
        String name;
        int type;
        int rssi;
        long lastSentTimestamp = 0;
        Runnable pendingRunnable = null;
    }
}