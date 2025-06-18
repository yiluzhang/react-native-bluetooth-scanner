import React, { useEffect, useState } from 'react';
import { Button, StyleSheet, Text, TextInput, TouchableOpacity, View, PermissionsAndroid, Platform, Alert, FlatList } from 'react-native';
import BLEScanner, { type Device } from 'react-native-bluetooth-scanner';

const requestPermission = async () => {
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
  const [devices, setDevices] = useState<Omit<Device, 'serviceData' | 'manufacturerData'>[]>();
  const [serviceDataMap, setServiceDataMap] = useState<Record<string, Device['serviceData']>>({});
  const [manufacturerDataMap, setManufacturerDataMap] = useState<Record<string, Device['manufacturerData']>>({});

  useEffect(() => {
    const subscription = BLEScanner.addListener(device => {
      if (device.serviceData) {
        setServiceDataMap(prev => ({ ...prev, [device.id]: device.serviceData }));
      }

      if (device.manufacturerData) {
        setManufacturerDataMap(prev => ({ ...prev, [device.id]: device.manufacturerData }));
      }

      setDevices(prev => {
        const exists = prev?.some(d => d.id === device.id);

        if (!exists) {
          return [...(prev || []), device];
        }

        return prev;
      });
    });

    return () => {
      BLEScanner.stopScan();
      subscription.remove();
    };
  }, []);

  const start = async () => {
    const access = await requestPermission();

    if (access) {
      BLEScanner.startScan();
      setScanning(true);
    }
  };

  const stop = async () => {
    if (scanning) {
      BLEScanner.stopScan();
      setScanning(false);
    }
  };

  return { scanning, devices, serviceDataMap, manufacturerDataMap, start, stop } as const;
}

const BluetoothScanScreen: React.FC = () => {
  const bluetoothScanner = useBluetoothScanner();
  const [searchText, setSearchText] = useState('');
  const [filteredScanResults, setFilteredScanResults] = useState<Device[]>();

  useEffect(() => {
    if (searchText) {
      const words = searchText
        .split(' ')
        .filter(o => o.length > 0)
        .map(o => o.toLowerCase());
      const results = bluetoothScanner.devices?.filter(device => {
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
      setFilteredScanResults(bluetoothScanner.devices);
    }
  }, [bluetoothScanner.devices, searchText]);

  const renderItem = ({ item }: { item: Device }) => {
    return (
      <TouchableOpacity onPress={() => showServiceData(item)}>
        <View style={styles.listItem}>
          <Text style={styles.fieldText}>ID：{item.id}</Text>
          <Text style={styles.fieldText}>Name：{item.name}</Text>
          <Text style={styles.fieldText}>RSSI：{item.rssi}</Text>
          <Text style={styles.fieldText}>Service Data：{JSON.stringify(item.serviceData)}</Text>
          <Text style={styles.fieldText}>ManufacturerData：{item.manufacturerData}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const showServiceData = (device: Device) => {
    const manufacturerData = bluetoothScanner.manufacturerDataMap[device.id];
    const serviceData = bluetoothScanner.serviceDataMap[device.id];

    if (!serviceData && !manufacturerData) {
      return;
    }

    const data = manufacturerData ? `${manufacturerData}\n` : '';
    Alert.alert('设备数据', data + (serviceData ? JSON.stringify(serviceData) : ''));
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="搜索名称或地址"
        value={searchText}
        onChangeText={setSearchText}
      />
      <View style={styles.buttonContainer}>
        <Button
          title={bluetoothScanner.scanning ? '停止扫描' : '开始扫描'}
          onPress={() =>
            bluetoothScanner.scanning ? bluetoothScanner.stop() : bluetoothScanner.start()
          }
        />
      </View>
      <FlatList contentContainerStyle={styles.listContainer} data={filteredScanResults} renderItem={renderItem} keyExtractor={item => item.id} />
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
    marginTop: 10,
    paddingHorizontal: 20,
  },
  listContainer: {
    paddingHorizontal: 20,
  },
  listItem: {
    paddingVertical: 12,
    minHeight: 60,
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
