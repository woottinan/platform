const util = require("util");
const fs = require("fs");
const path = require("path");
const execPromise = util.promisify(require("child_process").exec);
const exec = require("child_process").exec;
const engine = Vue.prototype.$engine;
const { default: PQueue } = engine.util.requireFunc("p-queue");
const GB = Vue.prototype.$global;
const mkdirp = engine.util.requireFunc("mkdirp");

//---- setup dir and config ----//
const platformName = "arduino-rp2350";
const platformDirectory = `${engine.util.platformDir}/${platformName}`;

const platform_path = platformDirectory + "/sdk";
const python3_path =
  platformDirectory + "/tools/pqt-python3/1.0.1-base-3a57aed-1/python3";
const compiler_path = platformDirectory + "/tools/pqt-gcc/4.1.0-1aec55e/bin/";
const uf2conv_path = platform_path + "/tools/uf2conv.py";
const picotool_path =
  platformDirectory + "/tools/pqt-picotool/4.1.0-1aec55e/picotool.exe";

const log = (msg) => {
  console.log(`[arduino-rp2350] : ${msg}`);
  GB.$emit("compile-log", `[arduino-rp2350] : ${msg}`);
};

const ospath = function (p) {
  if (process.platform == "win32") {
    return p.replace(/\//g, "\\\\");
  }
  return p;
};

const getFileName = (file) => path.basename(file);
const getName = (file) => getFileName(file).split(".")[0];

//=====================================//
async function compile(rawCode, boardName, config, cb) {
  log(`compiler.compile platformDir = ${platformDirectory}`);

  const boardDirectory = `${engine.util.boardDir}/${GB.board.board_info.name}`;
  const boardContext = JSON.parse(
    fs.readFileSync(boardDirectory + "/context.json", "utf8")
  );
  const build_dir = `${boardDirectory}/build`;

  if (!GB.not_first_compile) {
    if (fs.existsSync(build_dir)) {
      // Clear build folder
      engine.util.rmdirf(build_dir);
    }
    mkdirp.sync(build_dir);

    GB.not_first_compile = true;
  }

  const requiredDirs = [
    `${build_dir}/Invn`,
    `${build_dir}/Invn/Devices`,
    `${build_dir}/Invn/Devices/Drivers`,
    `${build_dir}/Invn/Devices/Drivers/Icm20948`,
  ];

  requiredDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log(`Created missing directory: ${dir}`);
    }
  });

  let sourceCode = "";
  let codeContext = {};
  if (config.isSourceCode) {
    // if code mode
    sourceCode = rawCode;

    // Searching all include to find matched used plugin file
    codeContext = {
      plugins_sources: [],
      plugins_includes_switch: [],
    };
    const pluginInfo = GB.plugin.pluginInfo;
    const incsRex = /#include\s*(?:\<|\")(.*?\.h)(?:\>|\")/gm;
    let m;
    while ((m = incsRex.exec(sourceCode))) {
      let incFile = m[1].trim();

      // Lookup plugin exist inc file and not added to compiled files.
      let includedPlugin = pluginInfo.categories.find(
        (obj) =>
          obj.sourceFile.includes(incFile) &&
          !codeContext.plugins_includes_switch.includes(obj.sourceIncludeDir)
      );
      if (includedPlugin) {
        log("Include Plugin to compiler => " + includedPlugin.category.name);
        codeContext.plugins_includes_switch.push(
          includedPlugin.sourceIncludeDir
        );
        let cppFiles = includedPlugin.sourceFile
          .filter((el) => el.endsWith(".cpp") || el.endsWith(".c"))
          .map((el) => includedPlugin.sourceIncludeDir + "/" + el);
        codeContext.plugins_sources.push(...cppFiles);
      }
    }
  } else {
    // if block mode, use codegen
    let codegen = null;
    if (fs.existsSync(`${boardDirectory}/codegen.js`)) {
      codegen = require(`${boardDirectory}/codegen.js`);
    } else {
      codegen = engine.util.requireFunc(`${platformDirectory}/codegen`);
    }
    if (codegen) {
      const res = codegen.generate(rawCode);
      sourceCode = res.sourceCode;
      codeContext = res.codeContext;
    }
  }

  const sketch_path = `${build_dir}/sketch.cpp`;
  fs.writeFileSync(sketch_path, sourceCode, "utf8");

  log(">>> Compile Files ...");

  const arduino_version = boardContext.arduino_version || "10607";

  // Compiler
  let compiler = {};
  compiler.path = compiler_path;

  compiler.libraries = {};
  compiler.libraries.ldflags = "";

  // compiler.warning_flags = "-Werror=return-type"; // เปิดเพื่อดู warning เป็น error
  compiler.warning_flags = "-w"; // ปิด warning ทั้งหมด
  let build = {};

  // ตั้งค่า build ที่สำคัญ
  build.chip = "rp2350";
  build.flash_total = "4194304";
  build.flash_length = "4194304";
  build.eeprom_start = "0";
  build.fs_start = "0";
  build.fs_end = "0";

  build.flags = {};
  build.flags.optimize = "-Os";
  build.flags.rtti = "-fno-rtti";
  build.flags.cmsis = "-DARM_MATH_CM33_FAMILY";
  build.flags.libstdcpp = "-lstdc++";
  build.flags.exceptions = "-fno-exceptions";
  build.flags.stackprotect = "";

  build.libpico = "libpico.a";
  build.libpicow = "";
  build.boot2 = "boot2_w25q64jv_4_padded_checksum";
  build.libpicowdefs = "-DLWIP_IPV6=0 -DLWIP_IPV4=1";
  build.wificc = "-DWIFICC=CYW43_COUNTRY_WORLDWIDE";
  build.debugscript = "picoprobe.tcl";
  build.picodebugflags = "";

  build.extra_flags = "";

  // board will overridden
  build.board = GB.board.board_info.name;
  build.arch = "RP2350";
  build.f_cpu = "150000000L";
  build.usbpid = "0x0005";
  build.usbvid = "0x2E8A";
  build.usbpwr = "-DUSBD_MAX_POWER_MA=250";
  build.usb_manufacturer = `-DUSB_MANUFACTURER=\\"puppybot6\\"`;
  build.usb_product = `-DUSB_PRODUCT=\\"puppybot6\\"`;
  build.ram_length = "524288";
  build.psram_length = 0;

  build.variant = GB.board.board_info.name;
  build.debug_port = "";
  build.debug_level = "";
  build.picodebugflags = "-DENABLE_PICOTOOL_USB";

  const libpicow_path = build.libpicow
    ? `"${platform_path}/lib/${build.chip}/${build.libpicow}"`
    : "";

  // overridden by board context.json
  if (boardContext.build) {
    build = { ...build, ...boardContext.build };
  }

  compiler.netdefines = `-DPICO_CYW43_ARCH_THREADSAFE_BACKGROUND=1 -DCYW43_LWIP=1 ${build.libpicowdefs} -DLWIP_IGMP=1 -DLWIP_CHECKSUM_CTRL_PER_NETIF=1`;

  compiler.defines = `-DPICO_RP2350 -DCFG_TUSB_MCU=OPT_MCU_RP2350 ${
    build.usbvid
  } ${build.usbpid} ${build.usbpwr} ${build.usb_manufacturer} ${
    build.usb_product
  } -DARDUINO_VARIANT="${
    build.variant || GB.board.board_info.name
  }" -DTARGET_RP2350 -DPICO_FLASH_SIZE_BYTES=${build.flash_total}`;

  compiler.includes = `-iprefix"${platform_path}" "@${platform_path}/lib/${build.chip}/platform_inc.txt" "@${platform_path}/lib/core_inc.txt" "-I${platform_path}/include" "-I${platform_path}/pico-sdk/src/${build.chip}/hardware_structs/include"`;

  compiler.flags = `-mcpu=cortex-m33 -march=armv8-m.main+fp+dsp -mthumb -mfloat-abi=softfp -mcmse -ffunction-sections -fdata-sections -fno-exceptions`;

  compiler.wrap = `"@${platform_path}/lib/${build.chip}/platform_wrap.txt" "@${platform_path}/lib/core_wrap.txt"`;

  compiler.libbearssl = `"${platform_path}/lib/${build.chip}/libbearssl.a"`;

  compiler.c = {};
  compiler.c.cmd = "arm-none-eabi-gcc";
  compiler.c.flags = `-c ${compiler.warning_flags} ${compiler.defines} ${compiler.flags} -MMD ${compiler.includes} -std=gnu17 -g -pipe`;

  compiler.c.elf = {};
  compiler.c.elf.cmd = "arm-none-eabi-g++";
  compiler.c.elf.flags = `${compiler.warning_flags} ${compiler.defines} ${compiler.flags} ${build.flags.optimize} -u _printf_float -u _scanf_float`;

  compiler.S = {};
  compiler.S.cmd = "arm-none-eabi-gcc";
  compiler.S.flags = `-c ${compiler.warning_flags} -g -x assembler-with-cpp -MMD ${compiler.includes} -g ${build.flags.cmsis}`;

  compiler.cpp = {};
  compiler.cpp.cmd = "arm-none-eabi-g++";
  compiler.cpp.flags = `-c ${compiler.warning_flags} ${compiler.defines} ${compiler.flags} -MMD ${compiler.includes} ${build.flags.rtti} -std=gnu++17 -g -pipe`;

  compiler.ar = {};
  compiler.ar.cmd = "arm-none-eabi-ar";
  compiler.ar.flags = "rcs";

  compiler.objcopy = {};
  compiler.objcopy.cmd = "arm-none-eabi-objcopy";
  compiler.objcopy.eep = {};
  compiler.objcopy.eep.flags =
    "-O ihex -j .eeprom --set-section-flags=.eeprom=alloc,load --no-change-warnings --change-section-lma .eeprom=0";

  compiler.elf2hex = {};
  compiler.elf2hex.cmd = "arm-none-eabi-objcopy";
  compiler.elf2hex.bin = {};
  compiler.elf2hex.bin.flags = "-O binary";
  compiler.elf2hex.hex = {};
  compiler.elf2hex.hex.flags = "-O ihex -R .eeprom";

  const undefined_symbols_flags = [
    "-Wl,--undefined=runtime_init_install_ram_vector_table",
    "-Wl,--undefined=__pre_init_runtime_init_clocks",
    "-Wl,--undefined=__pre_init_runtime_init_bootrom_reset",
    "-Wl,--undefined=__pre_init_runtime_init_early_resets",
    "-Wl,--undefined=__pre_init_runtime_init_usb_power_down",
    "-Wl,--undefined=__pre_init_runtime_init_clocks",
    "-Wl,--undefined=__pre_init_runtime_init_post_clock_resets",
    "-Wl,--undefined=__pre_init_runtime_init_spin_locks_reset",
    "-Wl,--undefined=__pre_init_runtime_init_boot_locks_reset",
    "-Wl,--undefined=__pre_init_runtime_init_bootrom_locking_enable",
    "-Wl,--undefined=__pre_init_runtime_init_mutex",
    "-Wl,--undefined=__pre_init_runtime_init_default_alarm_pool",
    "-Wl,--undefined=__pre_init_first_per_core_initializer",
    "-Wl,--undefined=__pre_init_runtime_init_per_core_bootrom_reset",
    "-Wl,--undefined=__pre_init_runtime_init_per_core_h3_irq_registers",
    "-Wl,--undefined=__pre_init_runtime_init_per_core_irq_priorities",
  ].join(" ");

  compiler.ldflags = `${compiler.wrap} -Wl,--cref -Wl,--check-sections -Wl,--gc-sections -Wl,--unresolved-symbols=report-all -Wl,--warn-common -Wl,-z,noexecstack ${undefined_symbols_flags}`;

  compiler.size = {};
  compiler.size.cmd = "arm-none-eabi-size";

  compiler.define = "-DARDUINO="; // TODO: why define it ? not use !

  compiler.readelf = {};
  compiler.readelf.cmd = "arm-none-eabi-readelf";

  compiler.c.extra_flags = "";
  compiler.c.elf.extra_flags = "";
  compiler.cpp.extra_flags = "";
  compiler.S.extra_flags = "";
  compiler.ar.extra_flags = "";
  compiler.elf2hex.extra_flags = "";

  // Compile patterns
  // ----------------

  let recipe = {};

  // Compile c files
  recipe.c_o_pattern = `"${compiler.path}${compiler.c.cmd}" ${compiler.c.flags} -DF_CPU=${build.f_cpu} -DARDUINO=${arduino_version} -DARDUINO_${build.board} -DBOARD_NAME="${build.board}" -DARDUINO_ARCH_${build.arch} ${compiler.c.extra_flags} ${build.extra_flags} ${build.debug_port} ${build.debug_level} ${build.flags.optimize} {includes} "{source_file}" -o "{object_file}"`;

  // Compile c++ files
  recipe.cpp_o_pattern = `"${compiler.path}${compiler.cpp.cmd}" -I "${build_dir}/core" ${compiler.netdefines} ${compiler.cpp.flags} -DF_CPU=${build.f_cpu} -DARDUINO=${arduino_version} -DARDUINO_${build.board} -DBOARD_NAME="${build.board}" -DARDUINO_ARCH_${build.arch} ${compiler.cpp.extra_flags} ${build.extra_flags} ${build.debug_port} ${build.debug_level} ${build.flags.optimize} ${build.wificc} {includes} "{source_file}" -o "{object_file}"`;

  // Compile S files
  recipe.S_o_pattern = `"${compiler.path}${compiler.S.cmd}" ${compiler.S.flags} -DF_CPU=${build.f_cpu} -DARDUINO=${arduino_version} -DARDUINO_${build.board} -DBOARD_NAME="${build.board}" -DARDUINO_ARCH_${build.arch} ${compiler.S.extra_flags} ${build.extra_flags} ${build.debug_port} ${build.debug_level} {includes} "{source_file}" -o "{object_file}"`;

  // Create archives
  recipe.ar_pattern = `"${compiler.path}${compiler.ar.cmd}" ${compiler.ar.flags} ${compiler.ar.extra_flags} "{archive_file}" "{object_file}"`;

  // Generate linker map with specific flash sizes/locations
  recipe.linking_prelink1_pattern = `"${python3_path}" -I "${platform_path}/tools/simplesub.py" --input "${platform_path}/lib/${build.chip}/memmap_default.ld" --out "${build_dir}/memmap_default.ld" --sub __FLASH_LENGTH__ ${build.flash_length} --sub __EEPROM_START__ ${build.eeprom_start} --sub __FS_START__ ${build.fs_start} --sub __FS_END__ ${build.fs_end} --sub __RAM_LENGTH__ ${build.ram_length} --sub __PSRAM_LENGTH__ ${build.psram_length}`;
  // Compile boot stage 2 blob
  recipe.linking_prelink2_pattern = `"${compiler.path}${compiler.S.cmd}" ${compiler.c.elf.flags} ${compiler.c.elf.extra_flags} -c "${platform_path}/boot2/rp2040/${build.boot2}.S" "-I${platform_path}/pico-sdk/src/${build.chip}/hardware_regs/include" "-I${platform_path}/pico-sdk/src/common/pico_binary_info/include" -o "${build_dir}/boot2.o"`;
  // Combine gc-sections, archives, and objects
  recipe.c_combine_pattern = `"${compiler.path}${compiler.c.elf.cmd}" "-L${build_dir}" ${compiler.c.elf.flags} ${compiler.c.elf.extra_flags} ${compiler.ldflags} "-Wl,--script=${build_dir}/memmap_default.ld" "-Wl,-Map,${build_dir}/firmware.map" -o "{elf_file}" -Wl,--start-group {object_files} "{archive_file}" "${build_dir}/boot2.o" "${platform_path}/lib/${build.chip}/ota.o" "${platform_path}/lib/${build.chip}/libpico.a" ${libpicow_path} ${compiler.libbearssl} -lm -lc ${build.flags.libstdcpp} -lc -Wl,--end-group`;

  // Create output (UF2 file)
  recipe.objcopy_uf2_pattern = `"${picotool_path}" uf2 convert "{elf_file}" "{uf2_file}" --family rp2350-arm-s --abs-block`;

  const plugins_includes_dir = [];

  // Gen include dir
  let includes_dir = [];
  includes_dir.push(`${platformDirectory}/sdk/cores/rp2350`); // platform sdk
  includes_dir.push(`${platformDirectory}/lib/${build.chip}`); // platform lib includes
  includes_dir.push(`${platformDirectory}/include`); // platform include dir
  includes_dir.push(`${boardDirectory}/include`); // board include dir
  includes_dir = includes_dir.concat(codeContext.plugins_includes_switch); // plugin includes

  // Gen sources dir
  let sources_cores_dir = [];
  sources_cores_dir.push(`${platformDirectory}/sdk/cores/rp2350`); // platform sdk
  sources_cores_dir.push(`${platformDirectory}/include`); // platform include dir
  sources_cores_dir.push(`${boardDirectory}/include`); // board include dir

  // Build source files
  const buildSourceFile = async (source_dir, source_file) => {
    log("Compiling => " + source_file);

    const file_name = getFileName(source_file);
    const object_file = source_file.replace(source_dir, build_dir) + ".o";

    let cmd = "";
    if (source_file.endsWith(".c")) {
      cmd = recipe.c_o_pattern;
    } else if (source_file.endsWith(".cpp")) {
      cmd = recipe.cpp_o_pattern;
    } else if (source_file.endsWith(".s") || source_file.endsWith(".S")) {
      cmd = recipe.S_o_pattern;
    }
    cmd = cmd.replace(
      "{includes}",
      includes_dir.map((dir) => `-I"${dir}"`).join(" ")
    );
    cmd = cmd.replace("{source_file}", source_file);
    cmd = cmd.replace("{object_file}", object_file);
    cmd = ospath(cmd).replace(/\s\s+/g, " ");

    // make dir if needs
    const dir = path.dirname(object_file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const { stderr } = await execPromise(cmd, { cwd: boardDirectory });
    if (!stderr) {
      log(`Compiled ... ${source_file} OK.`);
      cb(`compiling... ${file_name} ok.`);
    } else {
      log(`Compiled... ${source_file} OK. (with warnings)`);
      cb({
        file: file_name,
        error: stderr,
      });
    }

    return object_file;
  };

  const archiveFile = async (object_file, archive_file) => {
    log("Archives => " + object_file);

    const file_name = getFileName(object_file);

    let cmd = recipe.ar_pattern;
    cmd = cmd.replace("{archive_file}", archive_file);
    cmd = cmd.replace("{object_file}", object_file);
    cmd = ospath(cmd).replace(/\s\s+/g, " ");

    const { stderr } = await execPromise(cmd, { cwd: boardDirectory });
    if (!stderr) {
      log(`Archives ... ${object_file} OK.`);
      cb(`archives... ${file_name} ok.`);
    } else {
      log(`Archives... ${file_name} OK. (with warnings)`);
      cb({
        file: file_name,
        error: null,
      });
    }

    return archive_file;
  };

  // Build core file & Archives
  const archive_core_file = `${build_dir}/core.a`;
  if (!fs.existsSync(archive_core_file)) {
    // Find cores file
    const cores_object_files = [];
    for (const source_dir of sources_cores_dir) {
      const source_files = engine.util
        .walk(source_dir)
        .filter(
          (f) =>
            f.endsWith(".cpp") ||
            f.endsWith(".c") ||
            f.endsWith(".s") ||
            f.endsWith(".S")
        ); // find .c, .cpp, .s, .S
      for (const source_file of source_files) {
        cores_object_files.push(await buildSourceFile(source_dir, source_file));
      }
    }

    // caching cores file via archives .o to core.a
    for (const object_file of cores_object_files) {
      await archiveFile(object_file, archive_core_file);
    }
  }

  // Build plugin
  const plugin_object_files = [];
  for (const source_file of codeContext.plugins_sources) {
    const source_dir = path.dirname(source_file);
    plugin_object_files.push(await buildSourceFile(source_dir, source_file));
  }

  // Build sketch.cpp
  await buildSourceFile(build_dir, sketch_path);

  // Link object
  const elf_file = `${build_dir}/firmware.elf`;
  {
    const file_name = getFileName(elf_file);

    log(`>>> Linking... ${elf_file}`);
    cb(`linking... ${file_name}`);

    const object_files = [
      `${sketch_path}.o`, // sketch file
      ...plugin_object_files, // plugin
    ]
      .map((f) => `"${path.normalize(f)}"`)
      .join(" ");

    for (const recipe_pattern of [
      recipe.linking_prelink1_pattern,
      recipe.linking_prelink2_pattern,
      recipe.c_combine_pattern,
    ]) {
      let cmd = recipe_pattern;
      cmd = cmd.replace("{object_files}", object_files);
      cmd = cmd.replace("{archive_file}", archive_core_file);
      cmd = cmd.replace("{elf_file}", elf_file);
      cmd = ospath(cmd).replace(/\s\s+/g, " ");

      const { stderr } = await execPromise(cmd, { cwd: boardDirectory });
      if (stderr) {
        throw stderr;
      }
    }
    log(`Linking ... ${elf_file} OK.`);
    cb(`linking... ${file_name} ok.`);
  }

  // Create .uf2 file
  const uf2_file = `${build_dir}/firmware.uf2`;
  {
    log(`>>> Create .uf2 file ... ${uf2_file}`);
    cb(`create UF2 file ...`);

    const elf_file = `${build_dir}/firmware.elf`;

    // แปลง ELF เป็น UF2 ด้วย picotool ใช้ family rp2350-arm-s และ abs-block
    let cmd = `${ospath(
      picotool_path
    )} uf2 convert ${elf_file} ${uf2_file} --family rp2350-arm-s --abs-block`;
    const { stderr } = await execPromise(cmd, { cwd: boardDirectory });
    if (stderr) {
      throw stderr;
    }

    log(`Create ... ${uf2_file} OK.`);
    cb(`create UF2 file ok.`);
  }
}

async function flash(port, baudrate = 921600) {
  const uf2_file = `${engine.util.boardDir}/${GB.board.board_info.name}/build/firmware.uf2`;

  let cmd = `"${python3_path}" "${uf2conv_path}" --serial "${port}" --family RP2040 --deploy "${uf2_file}"`;

  log(`Flashing via serial port ${port} ... ${getFileName(uf2_file)}`);

  try {
    const { stdout, stderr } = await execPromise(ospath(cmd));
    if (stdout) log(`Flashing stdout: ${stdout}`);
    if (stderr) log(`Flashing stderr: ${stderr}`);
    log("Flashing complete.");
  } catch (error) {
    log(`Flashing error: ${error.message}`);
    if (error.stdout) log(`Error stdout: ${error.stdout}`);
    if (error.stderr) log(`Error stderr: ${error.stderr}`);
    throw error;
  }
}

module.exports = {
  compile,
  flash,
};
