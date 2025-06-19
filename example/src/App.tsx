import React, { useEffect, useMemo, useState } from 'react';
import { Button, StyleSheet, Text, TextInput, TouchableOpacity, View, PermissionsAndroid, Platform, Alert, FlatList } from 'react-native';
import BLEScanner, { type Device } from 'react-native-bluetooth-scanner';

const requestBluetoothPermission = async () => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]);

      const hasFine = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
      const hasCoarse = granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

      return hasFine || hasCoarse;
    } catch (err) {
      console.warn(err);
      return false;
    }
  }

  return true;
};

function useBluetoothScanner() {
  const [scanning, setScanning] = useState(false);
  // 设备基本信息，key 为大写设备 id
  const [deviceMap, setDeviceMap] = useState<Map<string, Pick<Device, 'id' | 'name' | 'type'>>>(new Map());
  // 设备完整信息，key 为大写设备 id
  const [scanResultMap, setScanResultMap] = useState<Map<string, Device>>(new Map());

  useEffect(() => {
    const subscription = BLEScanner.addListener((list) => {
      setDeviceMap((prev) => {
        const updated = new Map(prev);
        let hasUpdate = false;

        for (const device of list) {
          const id = device.id.toUpperCase();

          if (!updated.has(id)) {
            hasUpdate = true;
            updated.set(id, { id: device.id, name: device.name, type: device.type });
          }
        }

        return hasUpdate ? updated : prev;
      });

      setScanResultMap((prev) => {
        const updated = new Map(prev);
        list.forEach((d) => updated.set(d.id.toUpperCase(), d));
        return updated;
      });
    });

    return () => {
      BLEScanner.stopScan();
      subscription.remove();
    };
  }, []);

  const start = async () => {
    const access = await requestBluetoothPermission();

    if (access) {
      BLEScanner.startScan();
      setScanning(true);
    }
  };

  const stop = () => {
    BLEScanner.stopScan();
    setScanning(false);
  };

  const clear = () => {
    setDeviceMap(new Map());
    setScanResultMap(new Map());
  };

  return { scanning, deviceMap, scanResultMap, start, stop, clear } as const;
}

const BluetoothScanScreen: React.FC = () => {
  const bluetoothScanner = useBluetoothScanner();
  const devices = useMemo(() => Array.from(bluetoothScanner.deviceMap.values()), [bluetoothScanner.deviceMap]);
  const [searchText, setSearchText] = useState('');
  const [filteredScanResults, setFilteredScanResults] = useState<typeof devices>([]);

  useEffect(() => {
    if (searchText) {
      const words = searchText
        .split(' ')
        .filter((o) => o.length > 0)
        .map((o) => o.toLowerCase());
      const results = devices.filter((device) => {
        for (const word of words) {
          if (device.id.toLowerCase().includes(word)) {
            return true;
          }

          if (device.name?.toLowerCase().includes(word)) {
            return true;
          }
        }

        return false;
      });

      setFilteredScanResults(results);
    } else {
      setFilteredScanResults(devices);
    }
  }, [devices, searchText]);

  const renderItem = ({ item }: { item: Pick<Device, 'id' | 'name' | 'type'> }) => {
    return (
      <TouchableOpacity onPress={() => showServiceData(item.id)}>
        <View style={styles.listItem}>
          <Text style={styles.fieldText}>ID：{item.id}</Text>
          <Text style={styles.fieldText}>Name：{item.name}</Text>
          {item.type && <Text style={styles.fieldText}>Type：{item.type}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  const showServiceData = (id: string) => {
    const data = bluetoothScanner.scanResultMap.get(id.toUpperCase());

    if (!data?.manufacturerData && !data?.serviceData) {
      return;
    }

    const manufacturerData = data.manufacturerData ? `${data.manufacturerData}\n` : '';
    Alert.alert('设备数据', manufacturerData + (data.serviceData ? JSON.stringify(data.serviceData) : ''));
  };

  const click = () => {
    if (bluetoothScanner.scanning) {
      bluetoothScanner.stop();
    } else {
      bluetoothScanner.clear();
      bluetoothScanner.start();
    }
  };

  return (
    <View style={styles.container}>
      <TextInput style={styles.searchInput} placeholder="搜索名称或地址" value={searchText} onChangeText={setSearchText} />
      <View style={styles.buttonContainer}>
        <Button title={bluetoothScanner.scanning ? '停止扫描' : '开始扫描'} onPress={click} />
      </View>
      <FlatList contentContainerStyle={styles.listContainer} data={filteredScanResults} renderItem={renderItem} keyExtractor={(item) => item.id} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 65 : 25,
  },
  searchInput: {
    marginHorizontal: 20,
    paddingHorizontal: 12,
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    borderRadius: 8,
  },
  buttonContainer: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  listContainer: {
    paddingHorizontal: 20,
  },
  listItem: {
    justifyContent: 'center',
    paddingVertical: 12,
    minHeight: 80,
    borderBottomWidth: 1,
    borderBottomColor: '#d9d9d9',
  },
  fieldText: {
    marginBottom: 2,
    fontSize: 14,
    color: '#333',
  },
});

export default BluetoothScanScreen;
