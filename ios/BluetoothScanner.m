#import "BluetoothScanner.h"
#import <CoreBluetooth/CoreBluetooth.h>

@interface DeviceCache : NSObject
@property (nonatomic, strong) NSString *identifier;
@property (nonatomic, strong) NSString *name;
@property (nonatomic, strong) NSNumber *rssi;
@property (nonatomic, strong) NSString *manufacturerData;
@property (nonatomic, strong) NSDictionary *serviceData;
@property (nonatomic, assign) NSTimeInterval lastSentTime;
@property (nonatomic, strong) dispatch_block_t pendingBlock;
@end

@implementation DeviceCache
@end

@interface BluetoothScanner() <CBCentralManagerDelegate>

@property (nonatomic, strong) CBCentralManager *centralManager;
@property (nonatomic, assign) BOOL isScanning;
@property (nonatomic, strong) NSMutableDictionary<NSString *, DeviceCache *> *deviceCache;
@property (nonatomic, strong) dispatch_queue_t bluetoothQueue;

@end

@implementation BluetoothScanner

RCT_EXPORT_MODULE();

- (instancetype)init {
  if (self = [super init]) {
    _bluetoothQueue = dispatch_get_main_queue(); // 或自定义 queue
    _centralManager = [[CBCentralManager alloc] initWithDelegate:self queue:_bluetoothQueue];
    _deviceCache = [NSMutableDictionary dictionary];
    _isScanning = NO;
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onBluetoothDeviceFound"];
}

RCT_EXPORT_METHOD(startScan) {
  if (self.centralManager.state == CBManagerStatePoweredOn && !self.isScanning) {
    self.isScanning = YES;
    [self.centralManager scanForPeripheralsWithServices:nil options:@{CBCentralManagerScanOptionAllowDuplicatesKey: @YES}];
  }
}

RCT_EXPORT_METHOD(stopScan) {
  if (self.isScanning) {
    self.isScanning = NO;
    [self.centralManager stopScan];

    // 清理 pending block
    for (DeviceCache *cache in self.deviceCache.allValues) {
      if (cache.pendingBlock) {
        dispatch_block_cancel(cache.pendingBlock);
        cache.pendingBlock = nil;
      }
    }

    [self.deviceCache removeAllObjects];
  }
}

- (void)centralManagerDidUpdateState:(CBCentralManager *)central {
  if (central.state != CBManagerStatePoweredOn) {
    self.isScanning = NO;
  }
}

- (void)centralManager:(CBCentralManager *)central
 didDiscoverPeripheral:(CBPeripheral *)peripheral
     advertisementData:(NSDictionary<NSString *, id> *)advertisementData
                  RSSI:(NSNumber *)RSSI {

  NSString *identifier = peripheral.identifier.UUIDString;
  NSTimeInterval now = [NSDate date].timeIntervalSince1970;
  DeviceCache *cache = self.deviceCache[identifier];
  if (!cache) {
    cache = [[DeviceCache alloc] init];
    cache.identifier = identifier;
    self.deviceCache[identifier] = cache;
  }

  // 更新数据
  cache.name = peripheral.name ?: @"";
  cache.rssi = RSSI;

  NSData *manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey];
  if (manufacturerData) {
    cache.manufacturerData = [self hexStringFromData:manufacturerData];
  }

  NSDictionary *serviceData = advertisementData[CBAdvertisementDataServiceDataKey];
  if (serviceData) {
    NSMutableDictionary *serviceDict = [NSMutableDictionary dictionary];
    for (CBUUID *uuid in serviceData) {
      NSData *data = serviceData[uuid];
      serviceDict[uuid.UUIDString] = [self hexStringFromData:data];
    }
    cache.serviceData = serviceDict;
  }

  NSTimeInterval interval = now - cache.lastSentTime;
  if (interval > 1.0) {
    cache.lastSentTime = now;
    [self sendDeviceEvent:cache];
  } else {
    if (cache.pendingBlock) {
      dispatch_block_cancel(cache.pendingBlock);
    }

    __weak typeof(self) weakSelf = self;
    __weak typeof(cache) weakCache = cache;
    dispatch_block_t block = dispatch_block_create(0, ^{
      __strong typeof(self) strongSelf = weakSelf;
      __strong typeof(DeviceCache) *strongCache = weakCache;
      if (!strongSelf || !strongCache) return;

      strongCache.lastSentTime = [NSDate date].timeIntervalSince1970;
      [strongSelf sendDeviceEvent:strongCache];
      strongCache.pendingBlock = nil;
    });
    cache.pendingBlock = block;

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)((1.0 - interval) * NSEC_PER_SEC)), self.bluetoothQueue, block);
  }
}

- (void)sendDeviceEvent:(DeviceCache *)cache {
  NSMutableDictionary *body = [@{
    @"id": cache.identifier,
    @"name": cache.name ?: @"",
    @"rssi": cache.rssi ?: @(0)
  } mutableCopy];

  if (cache.manufacturerData) {
    body[@"manufacturerData"] = cache.manufacturerData;
  }

  if (cache.serviceData) {
    body[@"serviceData"] = cache.serviceData;
  }

  [self sendEventWithName:@"onBluetoothDeviceFound" body:body];
}

- (NSString *)hexStringFromData:(NSData *)data {
  const unsigned char *buffer = data.bytes;
  if (!buffer) return @"";

  NSMutableString *hex = [NSMutableString stringWithCapacity:data.length * 2];
  for (int i = 0; i < data.length; ++i) {
    [hex appendFormat:@"%02X", buffer[i]];
  }
  return hex;
}

@end
