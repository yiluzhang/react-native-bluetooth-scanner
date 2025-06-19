#import "BluetoothScanner.h"
#import <CoreBluetooth/CoreBluetooth.h>

@interface DeviceCache : NSObject
@property (nonatomic, strong) NSString *identifier;
@property (nonatomic, strong) NSString *name;
@property (nonatomic, strong) NSNumber *rssi;
@property (nonatomic, strong) NSString *manufacturerData;
@property (nonatomic, strong) NSDictionary *serviceData;
@end

@implementation DeviceCache
@end

@interface BluetoothScanner() <CBCentralManagerDelegate>

@property (nonatomic, strong) CBCentralManager *centralManager;
@property (nonatomic, assign) BOOL isScanning;
@property (nonatomic, strong) NSMutableArray<DeviceCache *> *deviceQueue;
@property (nonatomic, strong) dispatch_queue_t bluetoothQueue;
@property (nonatomic, strong) dispatch_source_t batchTimer;

@end

@implementation BluetoothScanner

RCT_EXPORT_MODULE();

- (instancetype)init {
  if (self = [super init]) {
    _bluetoothQueue = dispatch_get_main_queue();
    _centralManager = [[CBCentralManager alloc] initWithDelegate:self queue:_bluetoothQueue];
    _deviceQueue = [NSMutableArray array];
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
    [self startBatchTimer];
  }
}

RCT_EXPORT_METHOD(stopScan) {
  if (self.isScanning) {
    self.isScanning = NO;
    [self.centralManager stopScan];
    [self stopBatchTimer];
    [self.deviceQueue removeAllObjects];
  }
}

- (void)centralManagerDidUpdateState:(CBCentralManager *)central {
  if (central.state != CBManagerStatePoweredOn) {
    self.isScanning = NO;
    [self stopBatchTimer];
  }
}

- (void)centralManager:(CBCentralManager *)central
 didDiscoverPeripheral:(CBPeripheral *)peripheral
     advertisementData:(NSDictionary<NSString *, id> *)advertisementData
                  RSSI:(NSNumber *)RSSI {

  DeviceCache *cache = [[DeviceCache alloc] init];
  cache.identifier = peripheral.identifier.UUIDString;
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

  [self.deviceQueue addObject:cache];
}

- (void)startBatchTimer {
  if (self.batchTimer) return;

  self.batchTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, self.bluetoothQueue);
  dispatch_source_set_timer(self.batchTimer,
                            dispatch_time(DISPATCH_TIME_NOW, 0),
                            200 * NSEC_PER_MSEC,
                            50 * NSEC_PER_MSEC);
  __weak typeof(self) weakSelf = self;
  dispatch_source_set_event_handler(self.batchTimer, ^{
    __strong typeof(self) self = weakSelf;
    if (!self) return;

    if (self.deviceQueue.count == 0) return;

    NSMutableArray *batch = [NSMutableArray array];
    NSInteger count = 0;
    while (self.deviceQueue.count > 0 && count < 50) {
      DeviceCache *cache = self.deviceQueue.firstObject;
      if (cache) {
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

        [batch addObject:body];
        [self.deviceQueue removeObjectAtIndex:0];
        count++;
      }
    }

    if (batch.count > 0) {
      [self sendEventWithName:@"onBluetoothDeviceFound" body:batch];
    }
  });

  dispatch_resume(self.batchTimer);
}

- (void)stopBatchTimer {
  if (self.batchTimer) {
    dispatch_source_cancel(self.batchTimer);
    self.batchTimer = nil;
  }
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