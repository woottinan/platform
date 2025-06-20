mkdir -p build
#step 1 build cores
#open with mingw msys 1.0 
#make -f makeEspArduino.mk ESP_ROOT=./ CHIP=esp32 SKETCH=./libraries/WiFi/examples/WiFiScan/WiFiScan.ino BUILD_ROOT=./build
#output all out at  C:/Users/comdet/AppData/Local/Temp/mkESP/WiFiScan_esp32/WiFiScan.bin
#find ./cores/esp32 -maxdepth 99 -name "*.h" | sed 's+./cores/esp32/+#include "+g' | sed 's/$/"/' > ./build/arduino_esp32.ino
##################### NOTE #################
# remove main.cpp (we'll recompile again)
# in Arduino.h remove setup(); and loop();
# compile
# restore setup(void); loop(void); in Arduino.h 
# copy to destination folder and remove c cpp file
# rename arduino_esp32.a to libarduino_esp32.a
############################################
#D://KBIDEV2/platforms/arduino-avr/tools/bin/avr-g++ -c -v -g -Os -w -ffunction-sections -fdata-sections -mmcu=atmega328 -DF_CPU=16000000L -DARDUINO=18 -Isdk/cores/arduino -ID:/KBIDEV2/platforms/arduino-avr/sdk/variants/standard sdk/cores/arduino\abi.cpp -ooutput\_build\abi.cpp.o

CCOM="../tools/bin/avr-gcc"
CPPCOM="../tools/bin/avr-g++"
ARCOM="../tools/bin/avr-ar"
CFLAG="-c -g -Os -std=gnu11 -ffunction-sections -fdata-sections -MMD -fno-fat-lto-objects -mmcu=atmega328 -DARDUINO_AVR_UNO -DARDUINO_ARCH_ -DF_CPU=16000000L -DARDUINO=18 -Icores/arduino -Ivariants/standard"
CPPFLAG="-c -g -Os -std=gnu++11 -fpermissive -fno-exceptions -ffunction-sections -fdata-sections -fno-threadsafe-statics -Wno-error=narrowing -MMD -mmcu=atmega328 -DARDUINO_AVR_UNO -DARDUINO_ARCH_ -DF_CPU=16000000L -DARDUINO=18 -Icores/arduino -ID:/KBIDEV2/platforms/arduino-avr/sdk/variants/standard"
ARFLAG=""
#INC="-I./tools/sdk/include/config -I./tools/sdk/include/app_trace -I./tools/sdk/include/app_update -I./tools/sdk/include/asio -I./tools/sdk/include/bootloader_support -I./tools/sdk/include/bt -I./tools/sdk/include/coap -I./tools/sdk/include/console -I./tools/sdk/include/driver -I./tools/sdk/include/efuse -I./tools/sdk/include/esp-tls -I./tools/sdk/include/esp32 -I./tools/sdk/include/esp_adc_cal -I./tools/sdk/include/esp_event -I./tools/sdk/include/esp_http_client -I./tools/sdk/include/esp_http_server -I./tools/sdk/include/esp_https_ota -I./tools/sdk/include/esp_https_server -I./tools/sdk/include/esp_ringbuf -I./tools/sdk/include/espcoredump -I./tools/sdk/include/ethernet -I./tools/sdk/include/expat -I./tools/sdk/include/fatfs -I./tools/sdk/include/freemodbus -I./tools/sdk/include/freertos -I./tools/sdk/include/heap -I./tools/sdk/include/idf_test -I./tools/sdk/include/jsmn -I./tools/sdk/include/json -I./tools/sdk/include/libsodium -I./tools/sdk/include/log -I./tools/sdk/include/lwip -I./tools/sdk/include/mbedtls -I./tools/sdk/include/mdns -I./tools/sdk/include/micro-ecc -I./tools/sdk/include/mqtt -I./tools/sdk/include/newlib -I./tools/sdk/include/nghttp -I./tools/sdk/include/nvs_flash -I./tools/sdk/include/openssl -I./tools/sdk/include/protobuf-c -I./tools/sdk/include/protocomm -I./tools/sdk/include/pthread -I./tools/sdk/include/sdmmc -I./tools/sdk/include/smartconfig_ack -I./tools/sdk/include/soc -I./tools/sdk/include/spi_flash -I./tools/sdk/include/spiffs -I./tools/sdk/include/tcp_transport -I./tools/sdk/include/tcpip_adapter -I./tools/sdk/include/ulp -I./tools/sdk/include/unity -I./tools/sdk/include/vfs -I./tools/sdk/include/wear_levelling -I./tools/sdk/include/wifi_provisioning -I./tools/sdk/include/wpa_supplicant -I./tools/sdk/include/xtensa-debug-module -I./tools/sdk/include/esp32-camera -I./tools/sdk/include/esp-face -I./tools/sdk/include/fb_gfx -I./cores/esp32 -I./variants/esp32 -I./build"
#make -f makeEspArduino.mk lib ESP_ROOT=./ CHIP=esp32 SKETCH=./build/arduino_esp32.ino BUILD_ROOT=./build

#### compile c file ####
for line in $(find ./cores -maxdepth 99 -name "*.c"); do	
	outfile="$(basename $line).o"
	echo "compile $line > $outfile"
	eval "$CCOM $CFLAG $INC $line -o ./build/$outfile"
done

#### compile cpp file ####
for line in $(find ./cores -maxdepth 99 -name "*.cpp"); do	
	outfile="$(basename $line).o"
	echo "compile $line > $outfile"
	eval "$CPPCOM $CPPFLAG $INC $line -o ./build/$outfile"
done

#### create lib file ####
echo "Create core library"
ofile=$(ls ./build/*.o | tr '\r\n' ' ')
eval "$ARCOM cru ./build/libarduino_avr.a $ofile"
#eval "$ARCOM crs ./build/libarduino_avr.a $ofile"
echo "========= Finish build core library ==========="