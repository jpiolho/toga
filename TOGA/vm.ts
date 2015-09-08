import fs = require("fs");

var pm = [];
var dm = [];


for (var i = 0; i < 1 << 16; i++)
    dm.push(0);

var offsetDISPLAY = 256;



fs.readFile(process.argv[2], (err, data) => {


    for (var i = 0; i < data.length; i += 4) {
        pm.push({ a: data.readUInt16BE(i), b: data.readUInt16BE(i + 2) });
    }

    var pc = 0; // Program counter


    while (pc < pm.length) {
        var a = pm[pc].a;
        var b = pm[pc].b;

        dm[a] ^= 1;
        if (dm[a] == 1) {
            pc = b;
        } else {
            pc++;
        }


        // DISPLAY
        if (dm[offsetDISPLAY + 8] == 1) {
            var s = "";
            for (var i = offsetDISPLAY; i < offsetDISPLAY + 8; i++)
                s += dm[i];

            process.stdout.write(String.fromCharCode(parseInt(s, 2)));
        }
    }

    process.stdout.write("\n");
});
