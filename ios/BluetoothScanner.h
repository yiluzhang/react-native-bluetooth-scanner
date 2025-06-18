#import <Foundation/Foundation.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTBridgeModule.h>

@interface BluetoothScanner : RCTEventEmitter <RCTBridgeModule, CBCentralManagerDelegate>

@end
