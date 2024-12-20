// create unique id from content page
const id = crypto.randomUUID()

function sendMessage(type, data) {
  chrome.runtime.sendMessage({ id, type, data }).catch(() => { })
}

function toSeconds(time) {
  // split units
  const [hours, minutes, seconds] = time.split(":")
  // split seconds
  const [secs, mill] = seconds.split(",")
  // convert to seconds
  return (
    parseInt(hours, 10) * 3600 +
    parseInt(minutes, 10) * 60 +
    parseInt(secs, 10) +
    parseInt(mill, 10) / 1000
  )
}

function parseLines(text) {
  // split into text lines
  const lines = text.split(/\r?\n/)
  // output array
  const output = []
  // current line data
  let current = { from: 0, to: 0, text: "" }
  // for each line
  for (let i = 0; i < lines.length; i++) {
    // trim current line
    const line = lines[i].trim()
    // check for line format
    if (/^\d+$/.test(line)) {
      // reset current line on line number
      current = { from: 0, to: 0, text: "" }
    } else if (line.includes("-->")) {
      // parse time range
      const [start, end] = line.split("-->").map(time => time.trim())
      // set on current time values
      current.from = toSeconds(start)
      current.to = toSeconds(end)
    } else if (line) {
      // concat into line text
      current.text = (current.text ? current.text + "<br>" : "") + line
    } else if (current.text) {
      // push current line to output
      output.push(current)
    }
  }
  return output
}


const applyStyle = (element, current, history = null) => {
  // get current keys
  const keys = Object.keys(current)
  // for each key
  for (let i = 0; i < keys.length; i++) {
    // current key and value
    const key = keys[i]
    const value = current[key]
    // check with history value
    if (!history || history[key] !== value) {
      // set value on element
      element.style[key] = typeof value === "number"
        ? `${value}px` : value
      // update history
      if (history) { history[key] = value }
    }
  }
}

// player data
const data = {
  // init state
  init: false,
  // target element index
  target: null,
  // file name
  name: "none",
  // subtitle lines
  lines: []
}

// time data
const time = {
  // current playback time
  current: 0,
  // current playback duration
  duration: 0,
  // sync offset
  sync: 0
}

// display element data
const overlay = {
  // data version
  version: "1.1",
  // outer element
  outer: {
    element: document.createElement("div"),
    style: {
      // avoid inheritance
      all: "initial",
      // dimensions
      width: 0, height: 0,
      // position
      left: 0, top: 0,
      // alignment
      justifyContent: "center",
      alignItems: "end",
      // spacing
      paddingLeft: 65,
      paddingRight: 65,
      paddingTop: 86,
      paddingBottom: 86,
      // default
      pointerEvents: "none",
      position: "fixed",
      display: "flex",
      boxSizing: "border-box"
    }
  },
  // inner element
  inner: {
    element: document.createElement("div"),
    style: {
      // avoid inheritance
      all: "initial",
      // captions
      fontSize: 40,
      fontWeight: "normal",
      textAlign: "center",
      textShadow: "0px 0px 10px #000",
      // background
      backgroundColor: "rgba(0, 0, 0, 0.0)",
      // default
      pointerEvents: "none",
      color: "rgba(255, 255, 255, 1)",
      borderRadius: 10,
      padding: "8px 12px",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"
    }
  }
}

// get elements
const outer = overlay.outer.element
const inner = overlay.inner.element
// get style
const outerStyle = overlay.outer.style
const innerStyle = overlay.inner.style

// set element ids
outer.id = "-ext-sub-stream-overlay-outer"
inner.id = "-ext-sub-stream-overlay-inner"

// apply element styles
applyStyle(outer, outerStyle)
applyStyle(inner, innerStyle)

// append inner into outer
outer.appendChild(inner)

const init = () => {
  // set init flag
  data.init = true
  // start update frame loop
  update()
}

const update = () => {
  // request next frame
  if (data.init) { requestAnimationFrame(update) }
  // get current video element
  const video = data.target
  // check video element
  if (video) {
    // update current time and duration
    time.current = video.currentTime
    time.duration = video.duration
    // get current type by sync
    const current = time.current - time.sync
    // find line by current time
    const line = data.lines.find(line => (
      // line between start time and end tme
      line.from <= current && line.to >= current
    ))
    // get text to display
    const text = line ? line.text : ""
    // update inner element content
    if (inner.innerHTML !== text) { inner.innerHTML = text }
    // display inner by text
    inner.style.display = text !== "" ? "block" : "none"
    // get video bounding rect
    const rect = video.getBoundingClientRect()
    // update outer position
    applyStyle(outer, {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    }, outerStyle)
    // get parent element
    const parent = video.parentElement
    // check overlay on parent
    if (parent && !parent.querySelector("#" + outer.id)) {
      parent.appendChild(outer)
    }
  } else {
    inner.style.display = "none"
  }
}

// method to update video element
const onElement = () => {
  // get all video elements
  const elements = Array.from(document.querySelectorAll("video"))
  // get each duration
  const durations = elements.map(item => item.duration)
    .filter(item => !isNaN(item))
    .filter(item => item > 10)
  // return if no durations
  if (durations.length === 0) { return }
  // find maximum duration
  const maximum = Math.max(...durations)
  // return if current target duration is the same
  if (data.target && data.target.duration === maximum) { return }
  // set as target
  data.target = elements.find(item => item.duration === maximum)
}

// method to upload subtitle file
const onUpload = () => {
  return new Promise(resolve => {
    // create file input
    const input = document.createElement("input")
    // set input options
    input.type = "file"
    input.accept = ".srt"
    input.multiple = false
    // file input listener
    input.addEventListener("input", () => {
      // get file
      const file = input.files[0]
      // create file reader
      const reader = new FileReader()
      // loaded event listener
      reader.addEventListener("load", () => {
        // update file name
        data.name = file.name
        // parse subtitle lines
        data.lines = parseLines(reader.result)
        // resolve callback
        resolve()
      })
      // read file as text
      reader.readAsText(file)
    })
    // trigger file select
    input.click()
  })
}

chrome.runtime.onMessage.addListener(async (message, _s, callback) => {
  // get message data
  const action = message.action
  const payload = message.payload
  // check info action with id
  if (action !== "info" && message.id !== id) { return }
  // update target element
  onElement()
  // check info action
  if (action === "info") {
    // get child iframe from document
    const iframes = document.querySelectorAll("iframe")
    // send current frame details
    sendMessage("info", {
      target: data.target,
      duration: data.target ? data.target.duration : 0
    })
    // for reach iframe
    iframes.forEach((iframe) => {
      // send message to iframe content window
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(message, "*")
      }
    })
    // callback as success
    return callback(true)
  }
  // switch action
  if (action === "update") {
    // update name
    if ("name" in payload) { data.name = payload.name }
    // update lines
    if ("lines" in payload) { data.lines = payload.lines }
    // update sync offset
    if ("sync" in payload) { time.sync = payload.sync }
    // update outer style
    if ("outer" in payload) { applyStyle(outer, payload.outer, outerStyle) }
    // update inner style
    if ("inner" in payload) { applyStyle(inner, payload.inner, innerStyle) }
  } else if (action === "upload") {
    // upload subtitle file
    await onUpload()
  }
  // switch action
  if (action === "stop") {
    // reset initiation
    data.init = false
    // hide text element
    inner.style.display = "none"
    // reset name
    data.name = "none"
    // reset lies
    data.lines = []
    // callback all data
    sendMessage("data", { data, time, overlay })
  } else if (action === "time") {
    // callback time data
    sendMessage("time", { time })
  } else {
    // init player if not initiated
    if (!data.init) { init() }
    // callback all data
    sendMessage("data", { data, time, overlay })
  }
  // callback as success
  callback(true)
})
