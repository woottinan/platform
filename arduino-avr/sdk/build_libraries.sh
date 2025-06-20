mkdir -p build_libraries
#step 1 build cores
#open with mingw msys 1.0 
#make -f makeEspArduino.mk ESP_ROOT=./ CHIP=esp32 SKETCH=./libraries/WiFi/examples/WiFiScan/WiFiScan.ino BUILD_ROOT=./build
#make -f makeEspArduino.mk ESP_ROOT=./ CHIP=esp32 SKETCH=./libraries/ESPmDNS/examples/mDNS_Web_Server/mDNS_Web_Server.ino BUILD_ROOT=./build_libraries
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
CCOM="../tools/bin/avr-g++"
CPPCOM="../tools/bin/avr-g++"
ARCOM="../tools/bin/avr-ar"
CFLAG="-c -g -Os -w -ffunction-sections -fdata-sections -mmcu=atmega328 -DF_CPU=16000000L -DARDUINO=18 -Icores/arduino -ID:/KBIDEV2/platforms/arduino-avr/sdk/variants/standard"
CPPFLAG="-c -g -Os -w -ffunction-sections -fdata-sections -mmcu=atmega328 -DF_CPU=16000000L -DARDUINO=18 -Icores/arduino -ID:/KBIDEV2/platforms/arduino-avr/sdk/variants/standard"
#make -f makeEspArduino.mk lib ESP_ROOT=./ CHIP=esp32 SKETCH=./build/arduino_esp32.ino BUILD_ROOT=./build
LIBINC=""
for line in $(find ./libraries -maxdepth 99 -type d); do
	outfile="-I$line"
	LIBINC="$LIBINC $outfile"
done

#### compile c file ####
for line in $(find ./libraries -maxdepth 99 -name "*.c"); do
	outfile="$(basename $line).o"
	echo "compile $line > $outfile"
	eval "$CCOM $CFLAG $INC $LIBINC $line -o ./build_libraries/$outfile"
done

#### compile cpp file ####
for line in $(find ./libraries -maxdepth 99 -name "*.cpp"); do	
	outfile="$(basename $line).o"
	echo "compile $line > $outfile"
	eval "$CPPCOM $CPPFLAG $INC $LIBINC $line -o ./build_libraries/$outfile"
done

#### create lib file ####
echo "Create core library"
ofile=$(ls ./build_libraries/*.o | tr '\r\n' ' ')
eval "$ARCOM cru ./build_libraries/libarduino_avr_libraries.a $ofile"

echo "========= Finish build core library ==========="