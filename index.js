// query selector helpers
const qs = selector => document.querySelector(selector)
const qa = selector => document.querySelectorAll(selector)

function toTimeString(seconds) {
  // divide into units
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = parseInt(seconds % 60)
  // format pad start
  const ph = h.toString().padStart(2, "0")
  const pm = m.toString().padStart(2, "0")
  const ps = s.toString().padStart(2, "0")
  // return string
  return `${ph}:${pm}:${ps}`
}

// pages to avoid from messaging
const exceptions = [
  "about:",
  "chrome://",
  "chrome-extension://",
  "https://chrome.google.com/webstore"
]

const sendMessage = (action, payload = null) => {
  return new Promise(resolve => {
    // create message
    const message = {
      id: states.iframe ? states.iframe.id : null,
      action, payload
    }
    // return any non info message when no iframe found
    if (action !== "info" && !states.iframe) { return }
    // query active current tabs
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      // return if no tsbs
      if (tabs.length === 0) { return resolve(false) }
      // get active tab
      const activeTab = tabs[0]
      // return if no url
      if (!activeTab.url) { return resolve(false) }
      // return if active tab is a restricted page
      if (exceptions.some(part => activeTab.url.startsWith(part))) {
        return resolve(false)
      }
      // send message to get data
      chrome.tabs.sendMessage(activeTab.id, message).then(data => {
        // resolve data
        resolve(data)
      }).catch(() => resolve(false))
    })
  })
}

// app state object
const states = {
  tab: "upload",
  lines: [],
  time: null,
  iframe: null
}

// message callback handler
chrome.runtime.onMessage.addListener(message => {
  // return if no message
  if (!message) { return }
  // get message type
  const type = message.type
  // check info message
  if (type === "info") {
    // get iframe id
    const id = message.id
    // get target data
    const data = message.data
    // check target element from iframe
    if (states.iframe === null && data.target) {
      // check target duration
      if (data.duration > 60) {
        // set ready state
        qs(".upload-tray").classList.add("ready")
        document.body.setAttribute("data-ready", "true")
        // store as target iframe
        states.iframe = { id, duration: data.duration }
        // get and parse current settings
        const settings = JSON.parse(localStorage.getItem("settings") || "null")
        // check for current settings
        if (settings && settings.version === "1.1") {
          // send current settings
          sendMessage("update", {
            outer: settings.outer.style,
            inner: settings.inner.style
          }).then(onInit)
        } else {
          // request page data
          sendMessage("data").then(onInit)
        }
      }
    }
    // return as info message
    return
  }
  // get message data
  const data = message.data.data
  const time = message.data.time
  const overlay = message.data.overlay
  // switch by type
  if (type === "data") {
    // set initial lines
    if (states.tab === "upload") { onTiming(data.lines) }
    // update file name
    qs("[data-name]").setAttribute("data-name", data.name)
    qs(".upload-preview-name").innerHTML = data.name
    // update settings inputs
    if (states.tab !== "settings") {
      // set style data
      const outerStyle = overlay.outer.style
      const innerStyle = overlay.inner.style
      // spacing
      qs("#spacing-x").value = outerStyle.paddingLeft
      qs("#spacing-y").value = outerStyle.paddingTop
      // position
      qs("[data-position]").setAttribute(
        "data-position",
        `${outerStyle.alignItems}-${outerStyle.justifyContent}`
      )
      // font size
      qs("#font-size").value = innerStyle.fontSize
      // font weight
      qs("[data-weight]").setAttribute("data-weight", innerStyle.fontWeight)
      // background opacity
      qs("#background-opacity").value =
        innerStyle.backgroundColor.split(/[,)]/g)[3] * 100
    }
    // update timing input
    if (states.tab !== "timing") {
      // sync amount
      qs("#sync").value = message.data.time.sync
    }
    // store current overlay settings
    localStorage.setItem("settings", JSON.stringify(overlay))
  } else if (type === "time") {
    // update timing
    onTimingUpdate(time)
    // update timing input
    if (states.tab !== "timing") {
      // sync amount
      qs("#sync").value = message.data.time.sync
    }
  }
  // update preview time
  qs(".upload-preview-time").innerHTML = `
    ${toTimeString(time.current)} / ${toTimeString(time.duration)}
  `
})

// upload tray click event
qs(".upload-tray").addEventListener("click", () => {
  // trigger upload file
  sendMessage("upload")
})

// for each tab button
Array.from(qa(".tab")).forEach(tab => {
  // set tab id into app
  tab.addEventListener("click", () => {
    // set tab id on states
    states.tab = tab.classList[1]
    // update tab attribute
    document.body.setAttribute("data-tab", states.tab)
  })
})

const onStop = () => {
  // stop current captions
  sendMessage("stop")
}

const onTiming = lines => {
  // update lines
  states.lines = lines
  // get lines container
  const container = qs(".timing-lines")
  // reset container
  container.innerHTML = ""
  // for each line
  for (let i = 0; i < lines.length; i++) {
    // current line
    const line = lines[i]
    // create line element
    const item = document.createElement("div")
    item.className = "timing-line"
    // set item text
    item.innerHTML = line.text.replace(/<br>/g, " ")
    item.innerHTML = item.innerText
    // create item outer
    const outer = document.createElement("div")
    outer.className = "timing-line-outer"
    // sync event listener
    outer.addEventListener("click", () => {
      // return if no current time
      if (!states.time) { return }
      // calculate sync value
      const amount = (states.time.current - line.from).toFixed(4)
      // update on input
      qs("#sync").value = amount
      // sync message
      sendMessage("update", { sync: amount })
    })
    // append item
    outer.appendChild(item)
    container.appendChild(outer)
  }
}

const onTimingUpdate = time => {
  // set current time
  states.time = time
  // get line elements
  const items = qa(".timing-line")
  // for each line
  for (let i = 0; i < states.lines.length; i++) {
    // current line and item
    const line = states.lines[i]
    const item = items[i]
    // get current time by sync
    const current = time.current - time.sync
    // check line with current time
    if (line.from <= current && line.to >= current) {
      const amount = (current - line.from) / (line.to - line.from)
      item.classList.add("active")
      item.classList.remove("done")
      item.style.boxShadow = `inset ${400 * amount}px 0px 0px 0px #000`
    } else if (line.from < current) {
      item.classList.add("done")
      item.classList.remove("active")
      item.style.boxShadow = "none"
    } else {
      item.classList.remove("done")
      item.classList.remove("active")
      item.style.boxShadow = "none"
    }
  }
}

const onSettings = event => {
  // get target element
  const target = event.target
  // return if no value
  if (!target.value) { return }
  // get target key
  const key = target.id
  // get target value
  const value = target.value.toLowerCase()
  // switch by target key
  if (key === "font-size") {
    // update font size
    sendMessage("update", { inner: { fontSize: parseInt(value) } })
  } else if (key === "font-weight") {
    // update input
    qs("[data-weight]").setAttribute("data-weight", value)
    // update font weight
    sendMessage("update", { inner: { fontWeight: value } })
  } else if (key === "background-opacity") {
    // update background opacity
    sendMessage("update", {
      inner: {
        backgroundColor: `rgba(0, 0, 0, ${value / 100})`
      }
    })
  } else if (key === "spacing-x") {
    // update spacing in x direction
    sendMessage("update", {
      outer: {
        paddingLeft: parseInt(value),
        paddingRight: parseInt(value)
      }
    })
  } else if (key === "spacing-y") {
    // update spacing in y direction
    sendMessage("update", {
      outer: {
        paddingTop: parseInt(value),
        paddingBottom: parseInt(value)
      }
    })
  } else if (key === "position") {
    // update input
    qs("[data-position]").setAttribute("data-position", value)
    // update position
    sendMessage("update", {
      outer: {
        alignItems: value.split("-")[0],
        justifyContent: value.split("-")[1]
      },
      inner: {
        textAlign: {
          start: "left",
          center: "center",
          end: "right"
        }[value.split("-")[1]]
      }
    })
  }
}

// settings event listeners
qs("#settings").addEventListener("input", onSettings)
qs("#settings").addEventListener("click", onSettings)

// sync event listener
qs("#sync").addEventListener("input", event => {
  // get value
  const value = event.target.value.toString()
  // parse amount
  const amount = (parseFloat(value) || 0).toFixed(4)
  // sync message
  sendMessage("update", { sync: amount })
})

// stop event listener
qs("#stop").addEventListener("click", onStop)

const onInit = state => {
  // check init state
  if (state) {
    // request time frequently
    setInterval(() => sendMessage("time"), 100)
  } else {
    document.body.setAttribute("data-unsupported", "true")
  }
}

// initial info check
const checkLoop = () => {
  // send message
  sendMessage("info").then(() => {
    setTimeout(() => {
      // clear interval on video found
      if (!states.iframe) { checkLoop() }
    }, 100)
  })
}

// start check loop
checkLoop()
