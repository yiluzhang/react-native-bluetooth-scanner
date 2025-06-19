# react-native-bluetooth-scanner

一个简单的蓝牙扫描 React Native 库，Android 端使用经典蓝牙扫描，iOS 端使用 BLE 扫描，每 200 毫秒向 js 端广播一次，每次最多 50 条设备信息。
如果其他的库扫描不到你的设备，不妨试试这个。

## Installation

```sh
yarn add react-native-bluetooth-scanner
```

## Usage


```js
import BLEScanner from 'react-native-bluetooth-scanner';

// 监听扫描
const subscription = BLEScanner.addListener((devices) => {
  console.log('Found Device:', devices);
});

// 开始扫描
BLEScanner.startScan();

// 停止扫描
BLEScanner.stopScan();

// 移除监听器
subscription.remove();
```

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
