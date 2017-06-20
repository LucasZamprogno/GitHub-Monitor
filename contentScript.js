var mouseInput = true; // Using the mouse to fake gaze data?
var MUTATION_TIMEOUT = 200; // Time to wait for DOM mutations to finish
var PAGE_VIEW_TIME = 500; // How long user can look away before a page gaze is 'finished'
var githubTargets = {
	// General/shared
	'div.header': 'Main github header',
	'div.repohead': 'Repo header',
	'div.branch-select-menu > div.select-menu-modal-holder': 'Branch selection menu',
	'table.diff-table > tbody > tr': 'Special case, won\'t see this', // Code
	'div.comment': 'Comment',
	'form.js-new-comment-form': 'New comment form',
	// Main repo page
	'div.file-wrap': 'Repo file explorer',
	'div#readme': 'Repo README',
	'div.overall-summary': 'Landing page repo header (Commits, branches, etc.)',
	// Commits
	'li.commit': 'Special case, won\'t see this', // Specific commit
	'div.full-commit': 'Commit header',
	// Issues + Pull requests
	'div.subnav > div.subnav-spacer-right': 'Issue/Pull request filters',
	'div.table-list-header': 'Issue/Pull request dropdown menus',
	'li.js-issue-row': 'Special case, won\'t see this', // Issue OR pull request
	'div.new-issue-form > div.discussion-timeline': 'New issue form title and comment',
	'div#partial-discussion-header': 'Issue/Pull request header',
	'div.discussion-sidebar': 'Issue/Pull request sidebar',
	'div.discussion-item': 'Pull request discussion item',
	'div.pull-merging': 'Pull request merge status',
	'div.pull-request-review-menu': 'Pull request change review menu'
};
var stackoverflowTargets = {
	'div#question-header': 'Question title',
	'td.postcell': 'Question body',
	'div.comments': 'Comments',
	'td.answercell': 'Answer'
};
var googleTargets = {
	'div.sbibtd': 'Search field',
	'div.sbdd_a': 'Search suggestions',
	'div.g': 'Special case, won\'t see this'
};
var bitbucketTargets = {
	'div.fbnKxr': 'Navigation menu',
	// Overview
	'div#repo-metadata': 'Main repo information',
	'div#repo-stats': 'Main repo information',
	'div.readme': 'README',
	'div#repo-activity': 'Repo activity',
	// Source
	'div#inline-dialog-branch-dialog': 'Branch list',
	'table#source-list': 'File browser', // File/folder
	'article.readme': 'README',
	// Commits
	'table.commit-list > tbody > tr': 'Special case, won\'t see this', // Commit
	'div.udiff-line': 'Special case, won\'t see this', // Code
	'div.ellipsis': 'Hidden code expansion button',
	// Branches
	'table.branches-list > tbody > tr.iterable-item': 'Special case, won\'t see this', // Branch
	// Pull requests
	'div#pull-requests-filter-bar': 'Pull request filters',
	'tr.pull-request-row': 'Special case, won\'t see this', // Pull request
	// Specific pull request
	'div.compare-widget-container': 'Pull request branch details',
	'div#pullrequest-actions': 'Pull request actions',
	'header#pull-request-diff-header': 'Pull request information',
	// Issues
	'div.filter-container': 'Issue filters',
	'div.issues-toolbar-right': 'Issue filters',
	'table.issues-list > tbody > tr': 'Special case, won\'t see this', // Issue
	// Specific issue
	'div#issue-main-content': 'Issue content',
	'li.comment': 'Comment',
	'li.new-comment': 'New comment field',
	'div.issue-attrs': 'Issue details',
}
var allTargets = {
	'github': githubTargets,
	'stackoverflow': stackoverflowTargets,
	'google': googleTargets,
	'bitbucket': bitbucketTargets
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

var tracked = isTracked(); // Is this a page we have target HTML elements for

addAllListeners();

setMessageListener();

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
			handleGazeLoss(request['timestamp']);
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

// All lsitenres and intervals to be added at launch
function addAllListeners() {
	// Listeners for target events, these bubble up from their source
	document.addEventListener('click', genericEventHandler);
	document.addEventListener('dblclick', genericEventHandler);
	document.addEventListener('cut', genericEventHandler);
	document.addEventListener('copy', genericEventHandler);
	document.addEventListener('paste', genericEventHandler);
	document.addEventListener('contextmenu', genericEventHandler);
	addMouseListeners();

	// Do initial calibration
	document.body.addEventListener('mousemove', calibrate);

	// If using the mouse to simulate gazes, need to listen for mouse moves
	if(mouseInput) {
		document.body.addEventListener('mousemove', function(event) {
			imposterGazeEvent(event.clientX, event.clientY);
		});
	}

	if(tracked) {
		// If the page is no longer visible, end the last gaze event
		document.addEventListener('visibilitychange', function(event) {
			if(document.hidden) {
				handleGazeEvent(null, null, null);
			}
		});		
	} else {
		// If the page is changing, end the page view
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
	for(var identifier in getCurrentTargets()) {
		// Ugly hardcoding. Don't add listeners to every line of code
		if(identifier === 'table.diff-table > tbody > tr' || identifier === 'div.udiff-line') {
			continue;
		}
		var found = $(identifier);
		for(var item of found) {
			item.addEventListener('mouseenter', genericEventHandler);
			item.addEventListener('mouseleave', genericEventHandler);
		}
	}
	// Instead of each line of code, attempt to add to file containers
	var files = $('div.file');
	for(var item of files) {
		item.addEventListener('mouseenter', githubFileMouseEventHandler);
		item.addEventListener('mouseleave', githubFileMouseEventHandler);
	}
	var files = $('div.diff-container');
	for(var item of files) {
		item.addEventListener('mouseenter', bitbucketFileMouseEventHandler);
		item.addEventListener('mouseleave', bitbucketFileMouseEventHandler);
	}

}

/*************************
Event Monitoring Functions
*************************/

// Handles any 'addEventListener' style events
function genericEventHandler(event) {
	for(var identifier in getCurrentTargets()) {
		var found = $(event.target).closest(identifier);
		if(found.length) {
			var obj = eventInteractionObject(event.type, getTargetDescription(identifier, found));
			chrome.runtime.sendMessage(obj);
		}
	}
}

// Handles the mouseenter/leave events for files since they aren't in the normal list
function githubFileMouseEventHandler(event, target) {
	var obj = eventInteractionObject(event.type, getTargetDescription('div.file', event.target));
	chrome.runtime.sendMessage(obj);
}

function bitbucketFileMouseEventHandler(event, target) {
	var obj = eventInteractionObject(event.type, getTargetDescription('div.diff-container', event.target));
	chrome.runtime.sendMessage(obj);
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
	for(var identifier in getCurrentTargets()) {
		var found = $(viewed).closest(identifier);
		if(found.length) {
			targettedIdentifier = identifier;
			targettedElement = found;
			break;
		}
	}
	
	if(lastTarget && targettedElement) { // Past and current element are both targets
		if(!(lastTarget.is(targettedElement))) {
			handleGazeEvent(targettedElement, targettedIdentifier, null);
		} 
	} else if (lastTarget || targettedElement) { // Only one is/was is a target, definitely changed
		handleGazeEvent(targettedElement, targettedIdentifier, null);
	}
};

// How to lable the target. Null is untracked, some elements have single lable, some have variable labels
function getTargetDescription(key, elem) {
	if(key == null) {
		return 'Untracked';
	}
	switch(key) {
		case 'div.file': // Github file name
			return 'File: ' + $(elem).find('div.file-header > div.file-info > a').attr('title');
		case 'li.commit': // Github commit
			var data = elem.attr('data-channel');
			var split = data.split(':');
			var commitID = split[split.length - 1];
			var name = $(elem).find('p.commit-title > a').attr('title');
			return 'Commit: id - ' + commitID + ', name - ' + name;
		case 'li.js-issue-row': // Github issue in list
			var title = $(elem).find('div > div > a.h4').text().trim();
			var spanContent = $(elem).find('div > div > div > span.opened-by').text();
			var numberStr = spanContent.trim().split('\n')[0];
			return 'Issue/Pull request: ' + numberStr + ', ' + title;
		case 'div.g': // Google search result
			var link = $(elem).find('div > div.rc > h3.r > a').text().trim();
			return 'Google result: ' + link;
		case 'div.diff-container':
			var header = $(elem).find('div.heading > div.primary > h1.filename');
			header = $(header).contents().filter(function() { // Ignore <span>s
				return this.nodeType == 3;
			}).text().trim();
			return 'File: ' + header;
		case 'table.diff-table > tbody > tr': // Github Diff code line
			return githubLineDetails(elem);
		case 'table.commit-list > tbody > tr': // Bitbucket commits
			var idSplit = $(elem).find('td.hash > div > a').attr('href').split('/');
			var commitID = idSplit[idSplit.length - 1].trim();
			var name = $(elem).find('td.text > div > div > span.subject').text().trim();
			return 'Commit: id - ' + commitID + ', name - ' + name;
		case 'div.udiff-line': // Bitbucket code
			return bitbucketLineDetails(elem);
		case 'table.branches-list > tbody > tr.iterable-item': // Bitbucket branch from list
			return 'Branch ' + $(elem).find('td.branch-header > a').text().trim();
		case 'tr.pull-request-row': // Bitbucket pull request
			return 'Pull request: ' + $(elem).find('td.title > div > a').text().trim();
		case 'table.issues-list > tbody > tr': // Bitpucket issue
			return 'Issue: ' + $(elem).find('td.text > div > div > a').text().trim();
		default: // Used assigned label mapping in 'targets' global
			return getCurrentTargets()[key];
	}
}

// Get the specifics of a line of code (line numbers, code text)
function githubLineDetails(elem) {
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
			'change': type,
			'oldLineNum': oldLineNum,
			'newLineNum': newLineNum,
			'codeText': codeText
		};
	}
}

function bitbucketLineDetails(elem) {
	var type;
	var oldLineNum = $(elem).find('div.gutter > a.line-numbers')[0].getAttribute('data-fnum');
	var newLineNum = $(elem).find('div.gutter > a.line-numbers')[0].getAttribute('data-tnum');
	var codeText = $(elem).find('pre.source').text().trim();
	if(elem.hasClass('common')) {
		type = 'unchanged';
		codeText = codeText.trim();
	} else if(elem.hasClass('addition')) {
		type = 'addition';
		codeText = codeText.substring(1).trim();
	} else if(elem.hasClass('deletion')) {
		type = 'deletion';
		codeText = codeText.substring(1).trim();
	} else { // Hopefully shouldn't happen
		type = 'unknown';
		codeText = null;
	}
	return {
		'change': type,
		'oldLineNum': oldLineNum,
		'newLineNum': newLineNum,
		'codeText': codeText
	};
}

// For gazes on a target
function gazeInteractionObject(target, start, end) {
	var obj = {};
	obj['type'] = 'gaze';
	if(typeof target !== 'string') {
		obj['target'] = 'Code';
		for(var key in target) {
			obj[key] = target[key];
		}
	} else {
		obj['target'] = target;
	}
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

// Gaze has changed, report the completed gaze to background.js, set new gaze data
// If end is null, uses the current time
function handleGazeEvent(newElement, newIdentifier, end) {
	var gazeEnd;
	if(end) {
		gazeEnd = end;
	} else {
		gazeEnd = Date.now();
	}
	if(lastIdentifier && lastTarget) {
		var descrption = getTargetDescription(lastIdentifier, lastTarget);
		var obj = gazeInteractionObject(descrption, gazeStart, gazeEnd);
		chrome.runtime.sendMessage(obj);
	}
	lastTarget = newElement;
	lastIdentifier = newIdentifier;
	gazeStart = gazeEnd;
}

// If gazeLoss is recieved from background.js handle it appropriately
function handleGazeLoss(timestamp) {
	if(isTracked()) {
		handleGazeEvent(null, null, timestamp);
	} else {
		chrome.runtime.sendMessage(pageViewObject());
		clearInterval(pageViewInterval);
		pageViewInterval = null;
	}
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

// Returns the object of target elements possible on the current domain
function getCurrentTargets() {
	return allTargets[getCurrentTrackedDomain()];
}

// Gets the current domain (e.g. github, not www.github.com), returns null if not a tracked page
function getCurrentTrackedDomain() {
	for(var domain in allTargets) {
		if(window.location.hostname.includes(domain)) {
			return domain;
		}
	}
	return null;
}

// Is this page one that we have target elements for
function isTracked() {
	if(getCurrentTrackedDomain() !== null) {
		return true;
	}
	return false;
}