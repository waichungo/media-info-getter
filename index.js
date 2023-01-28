const path = require('path')
const fs = require("fs")
const { exec, spawn } = require("child_process")

//Regular expression to match media file format extension
const rgx = new RegExp(/(mp4|mp3|avi|vob|ts)$/gi)

//Recursively list files returning array of absolute ofile pths
function listFiles(dir) {
    var files = []
    if (dir && fs.existsSync(dir)) {
        var files = fs.readdirSync(dir)
        files = files.map((p) => path.join(dir, p))
        files.forEach(element => {
            if (fs.statSync(element).isDirectory()) {
                files = [...files, ...listFiles(element)]
            }
        });
        files = files.filter((e) => !fs.statSync(e).isDirectory())

    }
    return files
}
//Test if a file extension ends with a recognized media file extension format
function checkMedia(file) {
    return rgx.test(file)

}
//execute ffprobe to pass media metadata 
function getMetaData(file) {
    return new Promise((resolve, reject) => {
        exec(`ffprobe -v quiet -print_format json -show_format -show_streams "${file}"`, (err, stdout, stderr) => {
            if (err) {
                reject(err)
            } else {
                resolve(JSON.parse(stdout))
            }
        })
    })
}
//Awaitable sleep fuctionality using promises
function sleep(ms) {
    return new Promise((res) => {
        setTimeout(() => {
            res(ms)
        }, ms)
    })
}
//Parse duration from media file metadata
async function getDuration(file) {


    var duration = 0;
    try {
        let info = await getMetaData(file);
        duration = Number.parseFloat(info.format.duration)
    } catch (error) {
        console.error(error)
    }
    return duration
}
//convert seconds to hh:mm:ss formart
var toHHMMSS = (secs) => {
    var sec_num = parseInt(secs, 10)
    var hours = Math.floor(sec_num / 3600)
    var minutes = Math.floor(sec_num / 60) % 60
    var seconds = sec_num % 60

    return [hours, minutes, seconds]
        .map(v => v < 10 ? "0" + v : v)
        .filter((v, i) => v !== "00" || i > 0)
        .join(":")
}
//Call ffpbrobe get media info of a media file
async function getMediaInfo() {
    //Check command arguments
    if (process.argv.length > 2) {
        var path = process.argv[2];
        if (fs.existsSync(path)) {
            var isDir = fs.statSync(path).isDirectory()
            var totalDuration = 0;
            var totalFiles = 1
            var queued = 0;

            if (isDir) {
                var tasks = []
                //filter only media files
                var files = listFiles(path).filter((e) => checkMedia(e))
                totalFiles = 0
                //Calculate max filename length for std formmating
                var maxLength = 0;
                //Object to contain file and duration of every file
                var durationObjectList = []
                var count = 0;
                for (const file of files) {
                    queued++;
                    count++;
                    var split=file.split("\\")
                    let fileName=split[split.length-1]
                    let task = getDuration(file).then((dur) => {
                        if (dur > 0) {
                            totalFiles += 1
                            totalDuration += dur
                        }
                        durationObjectList.push({
                            file: fileName,
                            duration: dur
                        })
                        maxLength = fileName.length > maxLength ? fileName.length : maxLength
                        queued--
                    })
                    tasks.push(task)
                    while (queued > 4) {
                        //Save CPU by launching a max of 5 ffprobe instances at a time
                        await sleep(5000)
                    }
                   
                    var durText = toHHMMSS(totalDuration)
                   
                    console.log(`${parseInt((count * 100) / files.length, 10)}% complete ${count} of ${files.length} [total ${durText}]`)
                }
                //Wait for all tasks to finish
                await Promise.all(tasks)
                maxLength += (files.length + 2)
                var index = 0
                console.log("\n")
                for (const durObj of durationObjectList) {
                    console.log(`(${++index}) ${durObj["file"]}`.padEnd(maxLength) + `\t ${toHHMMSS(durObj["duration"])}`)
                }
            } else {
                totalDuration += await getDuration(path);
            }
            totalDuration = parseInt(totalDuration)
            var durText = toHHMMSS(totalDuration)

            console.log(`\nTotal duration of ${totalFiles} file(s) is ${durText} (${totalDuration}s)`)

        } else {
            console.error(`Path '${path}' doesn't exist`)
        }
    }
    else {
        console.error("A valid file or folder path is required")
    }
}
async function start() {
    getMediaInfo()
}
start()