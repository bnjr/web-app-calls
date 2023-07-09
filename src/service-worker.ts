// Array to store the excluded URLs
let excludedUrls: string[] = []

// The map to store unique URLs
let urlMap = new Map<string, string>()

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  // Allow users to open the sidebar by clicking on the action toolbar icon
  chrome.sidePanel
    .setPanelBehavior({openPanelOnActionClick: true})
    .catch((error) => console.error(error))
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.command) {
    case 'startCapture':
      // Get the excluded URLs from the request
      excludedUrls = request.excludedUrls || []
      urlMap.clear()
      // Start the webRequest listener
      chrome.webRequest.onBeforeRequest.addListener(
        listener,
        {urls: ['<all_urls>']},
        ['requestBody']
      )
      break
    case 'stopCapture':
      // Stop the webRequest listener
      chrome.webRequest.onBeforeRequest.removeListener(listener)
      break
    case 'getUrls':
      // Return the URL set when requested
      sendResponse(Array.from(urlMap))
      break
  }
  return true // This is required to indicate that you will send a response asynchronously
})

function listener(details: chrome.webRequest.WebRequestBodyDetails) {
  try {
    // Parse the URL and get the pathname + method
    const url = new URL(details.url)
    const pathname = url.pathname
    const hostname = `${url.protocol}//${url.hostname}:${url.port}`
    const {method} = details

    // Check if the pathname matches any of the excluded patterns
    // Also check if the pattern is not an empty string
    if (
      !details.url.includes('$batch') &&
      !excludedUrls.some((pattern) => pattern && pathname.includes(pattern)) &&
      !urlMap.has(pathname)
    ) {
      // Add the pathname and method to the map
      urlMap.set(pathname, method)

      // Send a message to the side panel with the new URL
      sendMessage('newUrl', pathname, hostname, method)
    }

    if (
      details.url.includes('$batch') &&
      details.requestBody &&
      details.requestBody.raw
    ) {
      // First show the Batch request
      // Send a message to the side panel with the new URL
      sendMessage('newUrl', pathname, hostname, method)

      const basePath = pathname.split('$batch')[0]

      // Fetching the request payload
      let decoder = new TextDecoder('utf-8')
      let payload = decoder.decode(details.requestBody.raw[0].bytes)

      // Splitting the payload into separate lines
      const lines = payload.split('\r\n')

      // Filter out lines that start with HTTP methods
      const requests = lines.filter((line) =>
        ['GET', 'POST', 'PUT', 'DELETE'].some((anyMethod) =>
          line.startsWith(anyMethod)
        )
      )

      requests.forEach((request, index) => {
        // Extract the method, url and other relevant parts from the request
        const [method, path] = request.trim().split(' ')
        const url = basePath + path

        // Check if the URL is not in the excluded URLs list
        if (!excludedUrls.some((pattern) => url.includes(pattern))) {
          // Send a message to the side panel with the new URL
          sendMessage('newUrl', url, hostname, method, true)
        }
      })
    }
  } catch (error) {
    console.error(error)
  }
}

function sendMessage(
  command: string,
  url: string,
  hostname: string,
  method: string,
  batch?: boolean
) {
  chrome.runtime.sendMessage({command, url, hostname, method, batch})
}
