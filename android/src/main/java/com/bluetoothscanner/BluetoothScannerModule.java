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
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.core.app.ActivityCompat;
import android.content.pm.PackageManager;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;

public class BluetoothScannerModule extends ReactContextBaseJavaModule {
  private static final String TAG = "BluetoothScanner";

  private final ReactApplicationContext reactContext;
  private final BluetoothAdapter bluetoothAdapter;
  private final Queue<DeviceCache> deviceQueue = new ConcurrentLinkedQueue<>();
  private final Handler handler = new Handler(Looper.getMainLooper());

  private final BroadcastReceiver receiver;

  private static final long REPORT_INTERVAL_MS = 200;
  private static final int MAX_DEVICES_PER_BATCH = 50;

  private boolean isScanning = false;
  private boolean isBatching = false;
  private boolean isReceiverRegistered = false;

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
            DeviceCache cache = new DeviceCache();
            cache.id = device.getAddress();
            cache.name = device.getName() != null ? device.getName() : "";
            cache.type = device.getType();
            cache.rssi = rssi;

            deviceQueue.offer(cache);
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

  private boolean hasRequiredPermissions() {
    int fineLocationPermission = ContextCompat.checkSelfPermission(reactContext, android.Manifest.permission.ACCESS_FINE_LOCATION);
    return fineLocationPermission == PackageManager.PERMISSION_GRANTED;
  }

  @SuppressLint("MissingPermission")
  @ReactMethod
  public void startScan() {
    if (bluetoothAdapter == null) {
      Log.w(TAG, "BluetoothAdapter is null");
      return;
    }

    if (!bluetoothAdapter.isEnabled()) {
      Log.w(TAG, "Bluetooth is not enabled");
      return;
    }

    if (!hasRequiredPermissions()) {
      Log.w(TAG, "Missing required permissions to scan Bluetooth devices");
      return;
    }

    if (isScanning) {
      Log.d(TAG, "Already scanning, ignore startScan call");
      return;
    }

    Log.d(TAG, "Start scanning");
    isScanning = true;

    if (!isReceiverRegistered) {
      IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_FOUND);
      reactContext.registerReceiver(receiver, filter);
      isReceiverRegistered = true;
    }

    bluetoothAdapter.startDiscovery();

    startBatchTimer();
  }

  @SuppressLint("MissingPermission")
  @ReactMethod
  public void stopScan() {
    if (!isScanning) {
      Log.d(TAG, "Not scanning, ignore stopScan call");
      return;
    }

    Log.d(TAG, "Stop scanning");
    isScanning = false;

    if (bluetoothAdapter != null && bluetoothAdapter.isDiscovering()) {
      bluetoothAdapter.cancelDiscovery();
    }

    if (isReceiverRegistered) {
      try {
        reactContext.unregisterReceiver(receiver);
      } catch (IllegalArgumentException ignored) {}
      isReceiverRegistered = false;
    }

    stopBatchTimer();
    deviceQueue.clear();
  }

  private final Runnable batchRunnable = new Runnable() {
    @Override
    public void run() {
      if (!isScanning) return;

      WritableArray deviceList = new WritableNativeArray();
      int count = 0;

      while (!deviceQueue.isEmpty() && count < MAX_DEVICES_PER_BATCH) {
        DeviceCache cache = deviceQueue.poll();
        if (cache != null) {
          WritableMap map = new WritableNativeMap();
          map.putString("id", cache.id);
          map.putString("name", cache.name);
          map.putInt("type", cache.type);
          map.putInt("rssi", cache.rssi);
          deviceList.pushMap(map);
          count++;
        }
      }

      if (deviceList.size() > 0) {
        Log.d(TAG, "Send batch devices: " + deviceList.size());
        sendEvent("onBluetoothDeviceFound", deviceList);
      }

      handler.postDelayed(this, REPORT_INTERVAL_MS);
    }
  };

  private void startBatchTimer() {
    if (isBatching) return;
    isBatching = true;
    handler.postDelayed(batchRunnable, REPORT_INTERVAL_MS);
  }

  private void stopBatchTimer() {
    if (!isBatching) return;
    isBatching = false;
    handler.removeCallbacks(batchRunnable);
  }

  private void sendEvent(String eventName, WritableArray data) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit(eventName, data);
  }

  private static class DeviceCache {
    String id;
    String name;
    int type;
    int rssi;
  }
}