import { NativeEventEmitter, NativeModules, type EmitterSubscription } from 'react-native';

const { BluetoothScanner } = NativeModules;

export interface Device {
  id: string;
  name: string;
  rssi: number;
  type?: number; // 只支持 Android
  serviceData?: Record<string, string>; // 只支持 iOS
  manufacturerData?: string; // 只支持 iOS
}

type BluetoothScannerType = {
  startScan(): void;
  stopScan(): void;
  addListener(listener: (devices: Device[]) => void): EmitterSubscription;
};

const emitter = new NativeEventEmitter(BluetoothScanner);

const addListener: BluetoothScannerType['addListener'] = (listener) => emitter.addListener('onBluetoothDeviceFound', listener);

const BluetoothScannerModule: BluetoothScannerType = {
  startScan: BluetoothScanner.startScan,
  stopScan: BluetoothScanner.stopScan,
  addListener,
};

export default BluetoothScannerModule;
