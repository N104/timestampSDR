const fs = require("fs");
const dgram = require("dgram");
const handleOptions = require("./src/handle_options");
const createFile = require("./src/create_file");
require("colors");

const server = dgram.createSocket("udp4");
const options = handleOptions();
let currFileNum = 1;
let timeoutID;
let file;

const startTimeout = () => {
	file.timeoutRunning = true;
	file.millisElapsed += Date.now() - file.recordStartTime;
	timeoutID = setTimeout(handleTimeout, options.timeout);
}

const cancelTimeout = () => {
	file.timeoutRunning = false;
	file.recordStartTime = Date.now();
	clearTimeout(timeoutID);
}

const handleTimeout = () => {
	file.writer.end(() => {
		const secondsElapsedTotal = file.millisElapsed / 1000;
		if (options.minDuration && secondsElapsedTotal < options.minDuration) {
			console.log(`-- Recording time shorter than minDuration (${secondsElapsedTotal}/${options.minDuration}s), deleting`.yellow);
			fs.unlink(file.name, err => { if (err) throw err });
		}
		else {
			const permanentFileName = file.name.replace(".temp", "");
			fs.rename(file.name, permanentFileName, (err) => {
				if (err) console.log(`Error encountered while attempting to remove .temp label from file ${file.name}`.red.bold, err);
			});
			console.log(`++ Recording #${currFileNum} saved (${secondsElapsedTotal}s)`.green);
			if (currFileNum < options.maxFiles || options.maxFiles == 0) {
				currFileNum++;
			}
			else {
				server.close();
			}
		}
		// Reset file so that can be detected and a new file created on next message receipt
		// Could recreate here but that would require initializing name, writer, and recordStartTime separately
		file = null;
	});
}

server.on("listening", () => {
	const address = server.address();
	console.log(`UDP Server listening on ${address.address}:${address.port}`);
});

server.on("message", (message) => {
	// Check if message contains data
	if (message.readInt16LE() !== 0) {
		if (!file) {
			file = createFile(options, currFileNum);
		} else if (file.timeoutRunning) {
			cancelTimeout();
		}
		file.writer.write(message);
	}
	// Message was empty, start timeout if not already running
	else if (file && !file.timeoutRunning) {
		startTimeout();
	}
});

server.bind(options.port, options.host);

process.on("uncaughtException", (err) => {
	if (err instanceof RangeError && err.stack.includes("readInt16LE")) {
		// message.readInt16LE throws three of these when GQRX is opened or the stream is stopped
		// Better to handle this here than on message level, as that would require checking every message
		return console.log("Error encountered - If stream was just opened/closed, this can be ignored".yellow);
	}
	throw err;
});
