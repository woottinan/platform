<template>
  <div>
    <v-tooltip bottom>
      <v-btn
        color="primary darken-2"
        slot="activator"
        icon
        @click="settingDialog = true"
      >
        <v-icon dark>fa-cogs</v-icon>
      </v-btn>
      <span>Setup board</span>
    </v-tooltip>

    <v-dialog v-model="settingDialog" max-width="500px">
      <v-card>
        <v-card-title>
          <span class="headline">Setup board</span>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text>
          <v-container grid-list-md>
            <v-layout wrap>
              <v-flex xs12>
                <v-subheader class="pa-0 mb-2">Board setting</v-subheader>
                <div class="d-flex">
                  <v-combobox
                    class="mr-3"
                    v-model="currentPort"
                    :items="comports"
                    item-text="text"
                    item-value="value"
                    label="Select COM port"
                  ></v-combobox>
                  <v-combobox
                    v-model="baudrate"
                    :items="baudrates"
                    label="Serial upload baudrate"
                  ></v-combobox>
                </div>
              </v-flex>
            </v-layout>
          </v-container>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="blue darken-1"
            flat
            @click.native="settingDialog = false"
            >Close</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
<script>
const engine = Vue.prototype.$engine;
const G = Vue.prototype.$global;
const SerialPort = engine.util.requireFunc("serialport");
export default {
  data() {
    return {
      comports: [],
      isFirstLoad: true,
      currentPort: null,
      baudrates: [57600, 115200, 256000, 230400, 512000, 921600],
      baudrate: 921600,
      showPassword: false,
      settingDialog: false,
    };
  },
  mounted() {
    this.listPort();
    this.$global.$on("board-change", this.listPort);
  },
  methods: {
    listPort() {
      SerialPort.list()
        .then((ports) => {
          if (ports.length > 0) {
            const excludePorts = ["/dev/tty.Bluetooth-Incoming-Port"];

            this.comports = ports
              .filter((p) => !excludePorts.includes(p.comName))
              .map((port) => {
                let label = port.comName;
                const description = `${port.pnpId || ""} ${port.manufacturer || ""} ${port.friendlyName || ""}`.toUpperCase();
                const isCH340 =
                  description.includes("CH340") ||
                  description.includes("USB-SERIAL") ||
                  description.includes("WCH") ||
                  description.includes("VID_1A86") ||
                  description.includes("CH9102") ||
                  description.includes("USB SERIAL") ||
                  description.includes("USB SERIAL DEVICE") ||
                  description.includes("VID_2E8A");

                if (isCH340) label += " (CH340)";

                return {
                  value: port.comName,
                  text: label,
                };
              });

            const preferredPortObj = this.comports.find((p) => p.text.includes("CH340")) || this.comports[0];
            this.currentPort = preferredPortObj;
            this.baudrate = 921600;

            const realPort = (preferredPortObj && preferredPortObj.value) || preferredPortObj;
            this.$global.board.package["arduino-avr-actionbar"].comport = realPort;
            this.$global.board.package["arduino-avr-actionbar"].baudrate = 921600;
          } else {
            this.comports = [];
            this.currentPort = null;
          }
        })
        .catch((err) => {
          console.log("Error on list port", err);
        });
    },
  },
  watch: {
    settingDialog(val) {
      if (val) {
        this.listPort();
        this.isFirstLoad = false;
      }
    },
    currentPort(val) {
      console.log("current Port changed. to", val);
      const realPort = val && typeof val === "object" ? val.value : typeof val === "string" ? val.split(" ")[0] : null;
      this.$global.board.package["arduino-avr-actionbar"].comport = realPort;
    },
    baudrate(val) {
      console.log(`current rate changed. to ${val}`);
      this.$global.board.package["arduino-avr-actionbar"].baudrate = val;
    },
  },
};
</script>
<style></style>
