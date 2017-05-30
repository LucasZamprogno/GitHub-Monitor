var PORT = 4321;

var targets = { // Keys are target identifiers, values are descriptors
// GITHUB
	// Main repo page/general
	'div.header': 'Main github header',
	'div.repohead': 'Repo header',
	'div.file-wrap': 'Repo file explorer',
	'div#readme': 'Repo README',
	'div.overall-summary': 'Repo header (Commits, branches, etc.)',
		// Figure out how to do branch list
	// Commits
	'li.commit': 'Special case, won\'t see this', // Would be cool to identify if they are looking at the commit name or id
	'div.full-commit': 'Commit header',
	'div.file': 'Special case, won\'t see this',
	'div#all_commit_comments': 'Commit comment section',
	// Issues + Pull requests
		// Figure out how to do filters
	'div.table-list-header': 'Issue/Pull request dropdown menus',
	'li.js-issue-row': 'Special case, won\'t see this',
	// Single issue + pull request comments
	'div.new-issue-form > div.discussion-timeline': 'New issue form title and comment',
	'div#partial-discussion-header': 'Issue/Pull request header',
	'div.discussion-sidebar': 'Issue/Pull request sidebar',
	'div.comment': 'Issue/Pull request comment',
	'div.discussion-item': 'Pull request discussion item', // Maybe expand this?
	'div.pull-merging': 'Pull request merge status',
	'form.js-new-comment-form': 'Issue/Pull request comment box',
	// Pull request files
	'div.pull-request-review-menu': 'Pull request change review menu',
// STACKOVERFLOW QUESTION
	'div#question-header': 'Question title',
	'td.postcell': 'Question body',
	'div.comments': 'Comments',
	'td.answercell': 'Answer',
};

/******************
Startup/Maintenance
******************/

var windowXOffset = window.screenX; // Window distance from screen (0,0)
var windowYOffset = window.screenY; 
var totalXOffset = null; // Difference between document (0,0) and screen pixel (0,0)
var totalYOffset = null; 
var browserXOffset = null; // Distance from side/top of window to document
var browserYOffset = null;

var recalibrationInterval;

addAllListeners();

// This listener will cancel itself upon completion
document.body.addEventListener('mousemove', calibrate);

// COMMENT OUT WHEN USING TRACKER - Reports mouse moves as gazes
document.body.addEventListener('mousemove', function(event) {
	postCoordToServer(event.clientX, event.clientY);
});

// If the page is no longer visible, end the last gaze event
document.addEventListener('visibilitychange', function(event) {
	if(document.hidden) {
		handleGazeEvent(null, null);
	}
});

// Listen for coordinates from background.js, report when nesessary
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if(request.hasOwnProperty('x') && request.hasOwnProperty('y')) {
		var result = checkForTargetChange(request.x, request.y);
		if(result) {
			chrome.runtime.sendMessage(result);
		}
	}
});

// Calculates document/pixel offsets, begins polling for coordinates, removes itself when complete
function calibrate(event) {
	totalXOffset = event.screenX - event.clientX;
	totalYOffset = event.screenY - event.clientY;
	browserXOffset = totalXOffset - windowXOffset;
	browserYOffset = totalYOffset - windowYOffset;
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

/*************************
Event Monitoring Functions
*************************/

// Just throw all the listeners on the document, the Big Brother approach to listeners
function addAllListeners() {
	document.addEventListener('click', genericEventHandler);
	document.addEventListener('dblclick', genericEventHandler);
	document.addEventListener('cut', genericEventHandler);
	document.addEventListener('copy', genericEventHandler);
	document.addEventListener('paste', genericEventHandler);
	document.addEventListener('contextmenu', genericEventHandler);
}

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

var lastTarget = null; // Last observerd DOM element
var lastIdentifier = null; // Identifier of last observed element
var gazeStart = Date.now(); // Timestamp of when observation of the element began

// Checks if viewed pixel is a new element of interest (file/code, comments, etc), logs if it is
function checkForTargetChange(x, y) {
	// TOGGLE FOLLOWING TWO LINES FOR MOUSE OR EYE INPUT
	var viewed = document.elementFromPoint(x, y);
	//var viewed = document.elementFromPoint(x - totalXOffset, y - totalYOffset);
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
	
	if(lastTarget && targettedElement) { // Past and current element are targets
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
		case 'div.file':
			return 'File: ' + $(elem).find('div.file-header > div.file-info > a').attr('title');
		case 'li.commit':
			var data = elem.attr('data-channel');
			var split = data.split(':');
			var commitID = split[split.length - 1];
			var name = $(elem).find('p.commit-title > a').attr('title');
			return 'Commit: id - ' + commitID + ', name - ' + name;
		case 'li.js-issue-row':
			var title = $(elem).find('div > div > a.h4').text();
			title = $.trim(title);
			var spanContent = $(elem).find('div > div > div > span.opened-by').text();
			var numberStr = $.trim(spanContent).split('\n')[0];
			return 'Issue/Pull request: ' + numberStr + ', \'' + title + '\'';
		default: // Used assigned label mapping in 'targets' global
			return targets[key];
			break;
	}
}

// Object creating funciton just for cleanliness
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

/*************
Other Functions
*************/

// Substitute for data being sent from eyetracker, sends cursor position to server
function postCoordToServer(xPos, yPos) {
	var obj = {
		'x': xPos,
		'y': yPos,
		'timestamp': Date.now()
	};
	chrome.runtime.sendMessage(obj);
}