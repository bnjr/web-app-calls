document.addEventListener('DOMContentLoaded', () => {
  // Get references to the button and the URL container
  const toggleCaptureButton = document.getElementById(
    'toggleCapture'
  ) as HTMLButtonElement
  const urlContainer = document.getElementById('urlContainer') as HTMLDivElement

  const clearCaptureButton = document.getElementById(
    'clearCapture'
  ) as HTMLButtonElement

  // Check if the elements exist in the DOM
  if (!toggleCaptureButton || !urlContainer || !clearCaptureButton) {
    console.error('Required elements are not found in the DOM')
    return
  }

  // Known templates
  const templates = {
    fiori: {
      excludedUrls: [
        '/sap/opu/odata/UI2/INTEROP/',
        '/sap/bc/ui5_ui5/ui2/ushell/resources/',
        '/sap/bc/ui2/flp',
      ],
      includedUrls: ['/odata/'],
      // add more known templates here
    },
  }

  document
    .getElementById('templates')
    ?.addEventListener('change', function (this: HTMLSelectElement) {
      if (this.value && templates[this.value]) {
        let template = templates[this.value]
        ;(
          document.getElementById('excludedUrls') as HTMLTextAreaElement
        ).value = template.excludedUrls.join('\n')
        ;(
          document.getElementById('includedUrls') as HTMLTextAreaElement
        ).value = template.includedUrls.join('\n')
      }
    })

  document
    .getElementById('loadTemplate')
    ?.addEventListener('change', function (this: HTMLInputElement) {
      if (this.files && this.files.length > 0) {
        let fileReader = new FileReader()
        fileReader.onload = function (event) {
          let template = JSON.parse(event.target?.result as string)
          ;(
            document.getElementById('excludedUrls') as HTMLTextAreaElement
          ).value = template.excludedUrls.join('\n')
          ;(
            document.getElementById('includedUrls') as HTMLTextAreaElement
          ).value = template.includedUrls.join('\n')
        }
        fileReader.readAsText(this.files[0])
      }
    })

  document
    .getElementById('saveTemplate')
    ?.addEventListener('click', function () {
      let template = {
        excludedUrls: (
          document.getElementById('excludedUrls') as HTMLTextAreaElement
        ).value.split('\n'),
        includedUrls: (
          document.getElementById('includedUrls') as HTMLTextAreaElement
        ).value.split('\n'),
      }
      let blob = new Blob([JSON.stringify(template)], {
        type: 'application/json',
      })
      let url = URL.createObjectURL(blob)
      let a = document.createElement('a')
      a.href = url
      a.download = 'template.json'
      a.click()
    })

  clearCaptureButton.addEventListener('click', () => {
    // Empty the URL container
    urlContainer.innerHTML = ''

    // Reset the isCapturing flag
    isCapturing = false

    // Reset the toggle capture button text
    toggleCaptureButton.innerText = 'Start Capture'

    // Send a command to background.ts to stop capturing
    chrome.runtime.sendMessage({
      command: 'stopCapture',
    })
  })

  // A flag to indicate whether we're capturing or not
  let isCapturing = false

  // The current capture cycle details and list
  let currentDetails: HTMLDetailsElement | null = null
  let currentList: HTMLUListElement | null = null

  // Event listener for the button click
  toggleCaptureButton.addEventListener('click', () => {
    // Toggle the isCapturing flag
    isCapturing = !isCapturing

    // Get the excluded URLs from the text area
    const excludedUrlsTextArea = document.getElementById(
      'excludedUrls'
    ) as HTMLTextAreaElement
    const includedUrlsTextArea = document.getElementById(
      'includedUrls'
    ) as HTMLTextAreaElement

    // Get the excluded URLs and included URLs from the text area, filter out empty strings
    const excludedUrls = excludedUrlsTextArea.value
      .split('\n')
      .filter((url) => url.trim() !== '')
    const includedUrls = includedUrlsTextArea.value
      .split('\n')
      .filter((url) => url.trim() !== '')

    // Send a command to background.ts to start/stop capturing
    chrome.runtime.sendMessage({
      command: isCapturing ? 'startCapture' : 'stopCapture',
      excludedUrls: excludedUrls,
      includedUrls: includedUrls,
    })

    // Update the button text
    toggleCaptureButton.innerText = isCapturing
      ? 'Stop Capture'
      : 'Start Capture'

    // Create new capture cycle details and list when we start capturing
    if (isCapturing) {
      currentDetails = document.createElement('details')
      currentDetails.open = true // this line ensures the details are open by default
      const summary = document.createElement('summary')
      summary.textContent = `Capture Cycle ${urlContainer.children.length + 1}`
      currentList = document.createElement('ul')
      currentDetails.appendChild(summary)
      currentDetails.appendChild(currentList)
      urlContainer.appendChild(currentDetails)
    }
  })

  // Variables to keep track of the current batch and its details
  let currentBatch: HTMLLIElement | null = null
  let currentBatchList: HTMLUListElement | null = null

  const createClickableLink = (
    method: string,
    pathname: string,
    hostname: string
  ): HTMLLIElement => {
    const listItem = document.createElement('li')

    if (method === 'GET') {
      const link = document.createElement('a')
      link.href = hostname + pathname
      link.textContent = `GET: ${pathname}`
      link.target = '_blank'
      listItem.appendChild(link)
    } else {
      listItem.textContent = `${method}: ${pathname}`
    }

    return listItem
  }

  // Listen for 'newUrl' messages from the service worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === 'newUrl' && currentList) {
      // const listItem = document.createElement('li')

      if (request.url.includes('$batch')) {
        const listItem = createClickableLink(
          request.method,
          request.url,
          request.hostname
        )

        // Create a details element for the batch
        const batchDetails = document.createElement('details')
        batchDetails.open = true // this line ensures the details are open by default
        const batchSummary = document.createElement('summary')
        batchSummary.textContent = 'Batched Requests'
        batchDetails.appendChild(batchSummary)

        // Create a new ul element for the batched requests and add it to the batchDetails
        const batchList = document.createElement('ul')
        batchDetails.appendChild(batchList)

        // Append the details element to the listItem
        listItem.appendChild(batchDetails)

        // Store the current batch and its batch list
        currentBatch = listItem
        currentBatchList = batchList

        // Append the listItem to the currentList
        currentList.appendChild(listItem)
      } else if (request.batch && currentBatch && currentBatchList) {
        // This is a batched request, add it to the current batch list
        const batchRequestItem = createClickableLink(
          request.method,
          request.url,
          request.hostname
        )
        currentBatchList.appendChild(batchRequestItem)
      } else if (!request.url.includes('$batch')) {
        const listItem = createClickableLink(
          request.method,
          request.url,
          request.hostname
        )

        // If this is a non-batch request, clear the current batch
        currentBatch = null
        currentBatchList = null

        // Append the listItem to the currentList
        currentList.appendChild(listItem)
      }
    }
  })
})
