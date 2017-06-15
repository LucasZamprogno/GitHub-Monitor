var domains = ['github', 'stackoverflow', 'google'];
var mouseInput = true;
var MUTATION_TIMEOUT = 200;
var PAGE_VIEW_TIME = 500;
var targets = { // Keys are target identifiers, values are descriptors
	// Common github elements
	'div.header': 'Main github header',
	'div.repohead': 'Repo header',
	'div.branch-select-menu > div.select-menu-modal-holder': 'Branch selection menu',
	'table.diff-table > tbody > tr': 'Special case, won\'t see this',
	'div.comment': 'Comment',
	'form.js-new-comment-form': 'New comment form',
	// Main repo page
	'div.file-wrap': 'Repo file explorer',
	'div#readme': 'Repo README',
	'div.overall-summary': 'Landing page repo header (Commits, branches, etc.)',
	// Commits
	'li.commit': 'Special case, won\'t see this', // Would be cool to identify if they are looking at the commit name or id
	'div.full-commit': 'Commit header',
	// Issues + Pull requests
	'div.subnav > div.subnav-spacer-right': 'Issue/Pull request filters',
	'div.table-list-header': 'Issue/Pull request dropdown menus',
	'li.js-issue-row': 'Special case, won\'t see this',
	'div.new-issue-form > div.discussion-timeline': 'New issue form title and comment',
	'div#partial-discussion-header': 'Issue/Pull request header',
	'div.discussion-sidebar': 'Issue/Pull request sidebar',
	'div.discussion-item': 'Pull request discussion item', // Maybe expand this?
	'div.pull-merging': 'Pull request merge status',
	'div.pull-request-review-menu': 'Pull request change review menu',
	// Stackoverflow question
	'div#question-header': 'Question title',
	'td.postcell': 'Question body',
	'div.comments': 'Comments',
	'td.answercell': 'Answer',
	// Google search results
	'div.sbibtd': 'Search field',
	'div.sbdd_a': 'Search suggestions',
	'div.g': 'Special case, won\'t see this'
};

/**************************
Startup variables/listeners
**************************/

var windowXOffset = window.screenX; // Window distance from screen (0,0)
var windowYOffset = window.screenY; 
var totalXOffset = null; // Difference between document (0,0) and screen pixel (0,0)
var totalYOffset = null; 

var lastTarget = null; // Last observerd DOM element
var lastIdentifier = null; // Identifier of last observed element
var gazeStart = Date.now(); // Timestamp of when observation of the element began
var lastGaze = Date.now(); // For page tracking, when was the last time 

var recalibrationInterval = null; // How often to check for a window move, starts after first calibration
var pageViewInterval = null; // How often to check if the user has been looking away from the page

var mouseListenerTimeout = null;

var tracked = isTracked(window.location.hostname); // Is this a page we have target HTML elements for

addAllListeners();

setMessageListener()

if(!tracked) {
	setPageViewInterval();
}

/****************
Startup functions
****************/

// Listen for coordinates from background.js, report when nesessary
function setMessageListener() {
	chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
		// If the message has coordinates
		if(request.hasOwnProperty('x') && request.hasOwnProperty('y')) {
			var x = request['x'];
			var y = request['y'];
			var zoom = request['zoom'];
			if(!mouseInput) { // Comes from eyetracker
				x = Math.round((x - totalXOffset)/zoom);
				y = Math.round((y - totalYOffset)/zoom);
			}
			if(tracked) {
				checkForTargetChange(x, y);
			} else {
				if(!pageViewInterval) {
					setPageViewInterval();
					gazeStart = Date.now();
				}
				// If the gaze falls on this page
				if(document.elementFromPoint(x, y) !== null) {
					lastGaze = Date.now();
				}
			}
		} else if(request.hasOwnProperty('gazeLoss')) {
			handleGazeEvent(null, null);
		}
	});
}

// Calculates document/pixel offsets, begins polling for coordinates, removes itself when complete
function calibrate(event) {
	totalXOffset = event.screenX - event.clientX;
	totalYOffset = event.screenY - event.clientY;
	console.log('Calibrated, totalXOffset = ' + totalXOffset + ', totalYOffset = ' + totalYOffset);
	recalibrationInterval = setInterval(function() { recalibrate() }, 1000);
	// Remove this listener
	document.body.removeEventListener('mousemove', calibrate);
}

// Check if the window has changed and update the offsets
function recalibrate() {
	// If the window has moved
	if(windowXOffset !== window.screenX || windowYOffset !== window.screenY) {
		var xDiff = window.screenX - windowXOffset;
		var yDiff = window.screenY - windowYOffset;
		// Make closest update to new offsets given the information
		totalXOffset += xDiff;
		totalYOffset += yDiff;
		windowXOffset += xDiff;
		windowYOffset += yDiff;
		// Get a correct calibration off next mouse move, should only matter if header resizes
		document.body.addEventListener('mousemove', calibrate);
	}
}

// How often to check if the user has been looking away from the page
function setPageViewInterval() {
	pageViewInterval = setInterval(function(){
		if(Date.now() - lastGaze > PAGE_VIEW_TIME) {
			chrome.runtime.sendMessage(pageViewObject());
			clearInterval(pageViewInterval);
			pageViewInterval = null;
		}
	}, PAGE_VIEW_TIME); 
}

// Just throw all the listeners on the document, the Big Brother approach to listeners
function addAllListeners() {
	// Listeners for target events
	document.addEventListener('click', genericEventHandler);
	document.addEventListener('dblclick', genericEventHandler);
	document.addEventListener('cut', genericEventHandler);
	document.addEventListener('copy', genericEventHandler);
	document.addEventListener('paste', genericEventHandler);
	document.addEventListener('contextmenu', genericEventHandler);
	addMouseListeners();

	// Do initial calibration
	document.body.addEventListener('mousemove', calibrate);

	if(mouseInput) {
		document.body.addEventListener('mousemove', function(event) {
			imposterGazeEvent(event.clientX, event.clientY);
		});
	}

	if(tracked) {
		// If the page is no longer visible, end the last gaze event
		document.addEventListener('visibilitychange', function(event) {
			if(document.hidden) {
				handleGazeEvent(null, null);
			}
		});		
	} else {
		window.addEventListener('beforeunload', function(event){
			chrome.runtime.sendMessage(pageViewObject());
		})
	}

	// After 100ms of no mutations, attempt to add mouseenter/mouseleave listeners to targets
	var observer = new MutationObserver(function(mutations) {
		if(mouseListenerTimeout === null) { // First change in a while? Set the timer
			mouseListenerTimeout = setTimeout(function(){
				addMouseListeners();
				mouseListenerTimeout = null;
			}, MUTATION_TIMEOUT);
		} else { // Timer running? Clear it and set a new one
			clearTimeout(mouseListenerTimeout);
			mouseListenerTimeout = setTimeout(function(){
				addMouseListeners();
				mouseListenerTimeout = null;
			}, MUTATION_TIMEOUT);
		}
	});

	var config = {
		subtree: true,
		attributes: true
	};

	observer.observe(document, config);
}

// Add mouseenter/mouseleave listeners to any present targets
function addMouseListeners() {
	for(var identifier of Object.keys(targets)) {
		var found = $(identifier);
		for(var item of found) {
			item.addEventListener('mouseenter', genericEventHandler);
			item.addEventListener('mouseleave', genericEventHandler);
		}
	}
}

/*************************
Event Monitoring Functions
*************************/

// Handles any 'addEventListener' style events
function genericEventHandler(event) {
	for(var identifier of Object.keys(targets)) {
		var found = $(event.target).closest(identifier);
		if(found.length) {
			var obj = eventInteractionObject(event.type, getTargetDescription(identifier, found));
			chrome.runtime.sendMessage(obj);
		}
	}
}

// Object creating funciton just for cleanliness
function eventInteractionObject(type, target) {
	return {
		'type': type,
		'target': target,
		'timestamp': Date.now(),
		'pageTitle': document.title,
		'pageHref': window.location.href
	};
}

/************************
Gaze Monitoring Functions
************************/

// Checks if viewed pixel is a new element of interest (file/code, comments, etc), logs if it is
function checkForTargetChange(x, y) {
	var viewed = document.elementFromPoint(x, y);
	var targettedIdentifier = null;
	var targettedElement = null;

	// Check each target key to see if currently viewed element is a child of it
	for(var identifier of Object.keys(targets)) {
		var found = $(viewed).closest(identifier);
		if(found.length) {
			targettedIdentifier = identifier;
			targettedElement = found;
			break;
		}
	}
	
	if(lastTarget && targettedElement) { // Past and current element are both targets
		if(!(lastTarget.is(targettedElement))) {
			handleGazeEvent(targettedElement, targettedIdentifier);
		} 
	} else if (lastTarget || targettedElement) { // Only one is/was is a target, definitely changed
		handleGazeEvent(targettedElement, targettedIdentifier);
	}
};

// How to lable the target. Null is untracked, some elements have single lable, some have variable labels
function getTargetDescription(key, elem) {
	if(key == null) {
		return 'Untracked';
	}
	switch(key) {
		case 'div.file': // Get github file name
			return 'File: ' + $(elem).find('div.file-header > div.file-info > a').attr('title');
		case 'li.commit': // Get githuv commit id and title
			var data = elem.attr('data-channel');
			var split = data.split(':');
			var commitID = split[split.length - 1];
			var name = $(elem).find('p.commit-title > a').attr('title');
			return 'Commit: id - ' + commitID + ', name - ' + name;
		case 'li.js-issue-row': // Get github issue name and number
			var title = $(elem).find('div > div > a.h4').text();
			title = $.trim(title);
			var spanContent = $(elem).find('div > div > div > span.opened-by').text();
			var numberStr = $.trim(spanContent).split('\n')[0];
			return 'Issue/Pull request: ' + numberStr + ', \'' + title + '\'';
		case 'div.g': // Get google result name link name
			var link = $(elem).find('div > div.rc > h3.r > a').text();
			link = $.trim(link);
			return 'Google result: ' + link;
		case 'table.diff-table > tbody > tr': // Diff code line
			return getLineDetails(elem);
		default: // Used assigned label mapping in 'targets' global
			return targets[key];
			break;
	}
}

function getLineDetails(elem) {
	if(elem.hasClass('js-expandable-line')) {
		return {'type': 'expandable code section'};
	} else {
		// Line nums will be null if not present (addition or deletion lines)
		var oldLineNum = $(elem).find('td.blob-num')[0].getAttribute('data-line-number');
		var newLineNum = $(elem).find('td.blob-num')[1].getAttribute('data-line-number');
		var codeElem = $(elem).find('td.blob-code');
		var codeText = codeElem.find('span.blob-code-inner').text();
		var type;
		if(codeElem.hasClass('blob-code-context')) {
			type = 'unchanged';
			codeText = codeText.trim();
		} else if(codeElem.hasClass('blob-code-addition')) {
			type = 'addition';
			codeText = codeText.substring(1).trim();
		} else if(codeElem.hasClass('blob-code-deletion')) {
			type = 'deletion';
			codeText = codeText.substring(1).trim();
		} else { // Hopefully shouldn't happen
			type = 'unknown';
			codeText = null;
		}
		return {
			'type': type,
			'oldLineNum': oldLineNum,
			'newLineNum': newLineNum,
			'codeText': codeText
		}
	}
}

// For gazes on a target
function gazeInteractionObject(target, start, end) {
	var obj = {};
	obj['type'] = 'gaze';
	obj['target'] = target;
	obj['timestamp'] = start;
	obj['timestampEnd'] = end;
	obj['duration'] = end - start;
	obj['pageTitle'] = document.title;
	obj['pageHref'] = window.location.href;
	return obj;
}

// For gazes on an untracked (no specified target elements) page
function pageViewObject() {
	var obj = {};
	obj['type'] = 'pageView';
	obj['timestamp'] = gazeStart;
	obj['timestampEnd'] = lastGaze;
	obj['duration'] = lastGaze - gazeStart;
	obj['domain'] = window.location.hostname;
	return obj;
}

// Gaze has changed, report the completed gaze to the server, set new gaze data
function handleGazeEvent(newElement, newIdentifier) {
	var gazeEnd = Date.now();
	if(lastIdentifier && lastTarget) {
		var descrption = getTargetDescription(lastIdentifier, lastTarget);
		var obj = gazeInteractionObject(descrption, gazeStart, gazeEnd);
		chrome.runtime.sendMessage(obj);
	}
	lastTarget = newElement;
	lastIdentifier = newIdentifier;
	gazeStart = gazeEnd;
}

/**************
Other Functions
**************/

// Substitute for data being sent from eyetracker, sends cursor position to server
function imposterGazeEvent(xPos, yPos) {
	var obj = {
		'x': xPos,
		'y': yPos,
		'timestamp': Date.now()
	};
	chrome.runtime.sendMessage(obj);
}

// Is this page one that we have target elements for
function isTracked(domain) {
	for(var d of domains) {
		if(domain.includes(d)) {
			return true;
		}
	}
	return false;
}