<template>
  <div>
    <v-tooltip bottom>
      <v-btn
        color="primary darken-2"
        slot="activator"
        icon
        @click="compileDialog = true"
      >
        <v-icon dark>fa-check</v-icon>
      </v-btn>
      <span>Just Compile</span>
    </v-tooltip>

    <v-dialog v-model="compileDialog" persistent max-width="450px">
      <v-card>
        <v-card-title>
          <span class="headline">Compile Program</span>
        </v-card-title>

        <v-card-text>
          <v-container>
            <v-layout align-center column>
              <v-flex xs12>
                <v-progress-circular
                  v-if="compileStep <= 2 && !failed"
                  :size="80"
                  :width="8"
                  color="primary"
                  indeterminate
                ></v-progress-circular>
                <v-fade-transition :hide-on-leave="true">
                  <v-icon color="green" size="110" v-if="compileStep > 2">
                    check_circle_outline
                  </v-icon>
                </v-fade-transition>
              </v-flex>
            </v-layout>
          </v-container>
          <v-flex xs12>
            <v-stepper v-model="compileStep" vertical class="elevation-0 pb-0">
              <v-stepper-step
                step="1"
                :complete="compileStep > 1"
                :rules="[() => stepResult['1'].result]"
              >
                Finding board
                <small v-if="compileStep > 1">{{ stepResult['1'].msg }}</small>
              </v-stepper-step>
              <v-stepper-content step="1" v-if="compileStep >= 1">
                {{ stepResult['1'].msg }}
              </v-stepper-content>

              <v-stepper-step
                step="2"
                :complete="compileStep >= 2"
                :rules="[() => stepResult['2'].result]"
              >
                Compile the code
                <small v-if="compileStep > 2">{{ stepResult['2'].msg }}</small>
              </v-stepper-step>
              <v-stepper-content step="2" v-if="compileStep >= 2">
                {{ stepResult['2'].msg }}
              </v-stepper-content>
            </v-stepper>
          </v-flex>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="blue darken-1"
            flat
            @click="run"
            :disabled="compileStep <= 2 && !failed"
          >
            Recompile
          </v-btn>
          <v-btn
            color="blue darken-1"
            flat
            @click="compileDialog = false"
            :disabled="compileStep <= 2 && !failed"
          >
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
const engine = Vue.prototype.$engine;
const G = Vue.prototype.$global;
const path = `${G.board.board_info.dir}/compiler.js`;
const boardCompiler = engine.util.requireFunc(path);

let mac = "";
let boardName = "";

export default {
  data() {
    return {
      compileStep: 1,
      compileDialog: false,
      failed: false,
      stepResult: {
        "1": { result: true, msg: "" },
        "2": { result: true, msg: "" },
        "3": { result: true, msg: "" },
      },
    };
  },
  methods: {
    updateCompileStep(step) {
      this.compileStep = step;
    },
    run() {
      G.$emit("compile-begin");
      this.updateCompileStep(1);
      this.stepResult["1"].result = true;
      this.stepResult["2"].result = true;
      this.stepResult["3"].result = true;
      this.failed = false;
      this.stepResult["1"].msg = `Compiling..`;

      Promise.resolve({ mac: "ff:ff:ff:ff:ff:ff" })
        .then((boardMac) => {
          mac = boardMac.mac;
          boardName = mac.replace(/:/g, "-");
          this.updateCompileStep(2);
          this.stepResult["2"].msg = "Compile board ... ";

          G.editor.rawCode = G.editor.Blockly.JavaScript.workspaceToCode(G.editor.workspace);
          const xml = G.editor.Blockly.Xml.domToText(
            G.editor.Blockly.Xml.workspaceToDom(G.editor.Blockly.mainWorkspace)
          );
          G.editor.blockCode = xml;

          const rawCode = G.editor.mode >= 3 ? G.editor.sourceCode : G.editor.rawCode;
          const actionbar = G.board.package["arduino-avr-actionbar"] || {};
          const config = {
            board_mac_addr: mac,
            isSourceCode: G.editor.mode >= 3,
            comport: typeof actionbar.comport === 'object' ? actionbar.comport.value : actionbar.comport,
            baudrate: actionbar.baudrate,
          };

          return boardCompiler.compile(rawCode, boardName, config, (status) => {
            this.updateCompileStep(2);
            if (!this.failed) {
              this.stepResult["2"].msg = status;
            }
          });
        })
        .then(() => {
          this.updateCompileStep(3);
          this.stepResult["2"].msg = "Compile done!";
          G.$emit("compile-success");
        })
        .catch((err) => {
          engine.util.compiler.parseError(err).then((errors) => {
            G.$emit("compile-error", errors);
            this.failed = true;
            const step = this.compileStep;
            this.stepResult[step].msg =
              step === 3
                ? "Cannot upload program : " + err
                : `${errors.join("\n")}`;
            this.stepResult[step].result = false;
          });
        });
    },
  },
  watch: {
    compileDialog(val) {
      if (val) {
        this.run();
      }
    },
  },
};
</script>
<style>
</style>
