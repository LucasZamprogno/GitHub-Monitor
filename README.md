# GitHub-Monitor

## Meta comments

This was the main component of the code review eye tracking study. Boy I wish I structured this better, this was a bad case of "I'm the only one working on this" and "just one quick change". Still very fun working with eye tracking data.

## Privacy

The only domains on which the tracker will record any specific information are GitHub, Google, and StackOverflow. On all other pages, the only thing that can be recorded is the domain name. Within those three specific domains, gazes and interaction with certain elements, for example a line of code, will record details about the element being looked at. For these specific elements there are privacy options to remove or obfuscate the content saved.

To see which DOM elements are tracked, take a look at the target objects at the top of contentScript.js. Any with a descriptor as the value will only save that string. All the special cases will have information recorded based on its case in the getTargetDescription function.

Information gathered by the content sript may be later discarded or obfuscated based on the privacy settings. This happens in the privacyFilter function in background.js.

## Components

There are three main components to the [extension](https://developer.chrome.com/extensions/overview): The popup, the background, and the content script. The three components all communicate with each other via [message passing](https://developer.chrome.com/extensions/messaging).

The [popup](https://developer.chrome.com/extensions/browserAction) is the interface the user can interact with in the top right of their browser. They can set their ID, start/stop the monitor, submit comments, change privacy settings, and see the status of the monitor. The popup can access the background page directly, and uses this to get and set the status of various parts of the extension. This is important because the popup refreshes completely every time it is clicked, no variables' states are saved. This means it needs to retrieve information from the background every time it is viewed.

The [background](https://developer.chrome.com/extensions/background_pages) is the hub of the extension, coordinating all general activity. This page is loaded on browser startup and will be loaded before the other parts of the extension. Additionally the background can save and read data to/from disk on the local machine, for example to store the user's ID so they don't need to enter it every time they start their browser. This is done through a natively defined variable called localStorage. It functions like an object but isn't explicitely declared anywhere. All values save as strings.
The background is responsible for initiation the websocket connection to, then recieive receiving coordinates from, the [eye tracker app](https://github.com/LucasZamprogno/EyeXApp). It then forwards the coordinates to all active chrome tabs, as well as taking any events created by the tabs and posting them back to the [main rest server](https://github.com/LucasZamprogno/Monitor-Server) to be saved. If the user has privacy settings enabled, it also filters out any dissalowed information. Somewhat counterintuitively, the 'badge' on the popup icon is modified by the background, not from the popup itself.

The [content script](https://developer.chrome.com/extensions/content_scripts) is what does all the analysis of user activity. Whenever a page loads the content script is injected into it. It should be noted that following some links does _not_ actually reload the page, but the content script will persisit in its current state between the pages. The content script has hardcoded values for all the websites and HTML targets of interest for the monitor. It listens for gaze data (in the form of coordinates) coming from messages sent by the background page. It then notes when the users gaze shifts between different elements of the page, and reports to the background once a gaze on a target has finished. Because the x,y coordinate of an element in the DOM is relative to the DOM itself and not the users screen, the content script does need to 'calibrate' itself by listening for mouse movements and calculating the distance between the mouses screenX/Y. If the user is not on a tracked page, it reports on gazes at the page in general. In addition, traditional event listeners are used to record events such as clicks, or copy/pasting. When an event occurs the content script will pull out relevant information from the element, such as filenames, issue titles, or the code in a file.

## Results

The paper writeup at the end of the reasearch project can be found [here](./Results/448-Paper.pdf). 

Below are two figures showing different gaze patterns observed using the tool. These should be read as a left-to-right timeline, with blue dots/lines representing gaze events. Gaps are when the user is looking away from the screen or on another tab.

![Gaze 1](./Results/S1-wide.png)

![Gaze 2](./Results/S2-wide.png)


