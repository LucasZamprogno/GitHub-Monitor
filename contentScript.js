var mouseInput = false; // Using the mouse to fake gaze data?
var MUTATION_TIMEOUT = 200; // Time to wait for DOM mutations to finish
var PAGE_VIEW_TIME = 500; // How long user can look away before a page gaze is 'finished'
var RECALIBRATION_TIME = 1000;
var githubTargets = { // Order may matter if an element is a child of another. First in object has higher precedence
	// General/shared
	'a.diff-expander': 'Special case, won\'t see this', // Diff separator expansion button
	// These elements are child of the tr element following them, they MUST come first
	'td.blob-code-addition': 'Special case, won\'t see this', // Diff line code
	'td.blob-num-addition': 'Special case, won\'t see this', // Diff line number
	'td.blob-code-deletion': 'Special case, won\'t see this', // Diff line code
	'td.blob-num-deletion': 'Special case, won\'t see this', // Diff line number
	'td.blob-code-context': 'Special case, won\'t see this', // Diff line code
	'td.blob-num-context': 'Special case, won\'t see this', // Diff line number
	'table > tbody > tr.blob-expanded': 'Special case, won\'t see this', // Diff line row
	'table > tbody > tr.js-expandable-line': 'Special case, won\'t see this', // Expandable diff separator
	'table > tbody > tr.inline-comments': 'Special case, won\'t see this',
	'div.comment': 'Comment',
	'form.js-new-comment-form': 'New comment form',
	'div.review-comment': 'Code review comment', // typically inline with other elements
	// Main repo page
	'div.file-wrap': 'Repo file explorer',
	'div#readme': 'Repo README',
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
	'div.discussion-item': 'Pull request discussion action item',
	'div.pull-merging': 'Pull request merge status',
	'div.pull-request-review-menu': 'Pull request change review menu',
	'table > tbody > tr': 'Special case, won\'t see this' // All other table lines
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
	'div.kp-blk': 'Related searches',
	'div.g': 'Special case, won\'t see this'
};
var allTargets = {
	'github': githubTargets,
	'stackoverflow': stackoverflowTargets,
	'google': googleTargets
};

var pageTypeRegex = {
	'Github main repo page': new RegExp('https:\/\/github\.com\/[^/]+\/[^/]+$'),
	'Github commits': new RegExp('https:\/\/github\.com\/[^/]+\/[^/]+\/commits\/[^/]+$'),
	'Github commit': new RegExp('https:\/\/github\.com\/[^/]+\/[^/]+\/commit\/[0-9a-f]+$'),
	'Github issues': new RegExp('https:\/\/github\.com\/[^/]+\/[^/]+\/issues$'),
	'Github issue': new RegExp('https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\\d+$'),
	'Github pull requests': new RegExp('https:\/\/github\.com\/[^/]+\/[^/]+\/pulls$'),
	'Github pull request': new RegExp('https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\\d+$'),
	'Github pull request commits': new RegExp('https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\\d+\/commits$'),
	'Github pull request commit': new RegExp('https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\\d+\/commits\/[0-9a-f]+$'),
	'Github pull request files': new RegExp('https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\\d+\/files$'),
	'Google search': new RegExp('https:\/\/www.google\.[a-z]{2,3}\/search.+'),
	'Stack Overflow question': new RegExp('https:\/\/stackoverflow\.com\/questions\/.+$')
}

/*************************************
Startup/Global Variables and Listeners
*************************************/

var calibrated = false; // Has a calibration been run
var lastZoom = null; // Last recorded zoom ratio
var windowXOffset = window.screenX; // Window (0,0) distance from screen (0,0)
var windowYOffset = window.screenY; 
var totalXOffset = null; // Document (0,0) distance from screen (0,0)
var totalYOffset = null; 

var lastTarget = null; // Last observerd DOM element
var lastIdentifier = null; // Identifier (e.g. 'li.commit') of last observed element
var gazeStart = Date.now(); // Timestamp of when observation of an element began
var lastGaze = Date.now(); // For page tracking, when was the last time a gaze was registered on the page

var recalibrationInterval = null; // How often to check for a window move, starts after first calibration
var pageViewInterval = null; // How often to check if the user has been looking away from the page

var debounceTimeout = null; // Used when waiting for DOM changes to finish before adding listeners

var tracked = isTracked(); // Is this a page we have target HTML elements for

addAllListeners();

if(!tracked) {
	setPageViewInterval();
}

/****************************
Startup/maintenance functions
****************************/

function messageListener(request, sender, sendResponse) {
	switch(request['comType']) {
		case 'coord':
			var x = request['x'];
			var y = request['y'];
			var zoom = request['zoom'];
			lastZoom = zoom;
			if(!mouseInput) { // Comes from eyetracker
				x = Math.round((x - totalXOffset)/zoom);
				y = Math.round((y - totalYOffset)/zoom);
			}
			var inX = x > window.screenX && x < window.screenX + window.outerWidth;
			var inY = y > window.screenY && y < window.screenY + window.outerHeight;
			var inW = inX && inY;
			sendResponse({'inWindow': inW});
			if(tracked) {
				if(calibrated) {
					handleNewGaze(x, y);
				}
			} else { // Untracked
				// If the gaze falls on this page
				if(document.elementFromPoint(x, y) !== null) {
					if(!pageViewInterval) {
						setPageViewInterval();
						gazeStart = Date.now();
					}
					lastGaze = Date.now();
				}
			}
			break;
		case 'gazeLoss':
			handleGazeLoss(request['timestamp'])
			break;
		case 'diffs':
			if(request['pageHref'] !== window.location.href) {
				return; // User left the page already
			}
			var diffInfo = {
				'comType': 'diffs',
				'type': 'diffs',
				'pageHref': request['pageHref'],
				'diffs': []
			};
			indexDiffs();
			$('div.file').each(function(index) {
				diffInfo['diffs'].push(getDiffData(this));
			});
			if(diffInfo['diffs'].length > 0) {
				chrome.runtime.sendMessage(diffInfo);
			}
			break;
	}
}

// Calculates document/pixel offsets, begins polling for coordinates, removes itself when complete
function calibrate(event) {
	if(lastZoom) { // Needed for calibration
		totalXOffset = event.screenX - (event.clientX * lastZoom);
		totalYOffset = event.screenY - (event.clientY * lastZoom);
		recalibrationInterval = setInterval(function() { recalibrate() }, RECALIBRATION_TIME);
		// Remove this listener
		document.body.removeEventListener('mousemove', calibrate);
		calibrated = true;
	}
}

// Check if the window has changed and update the offsets
function recalibrate() {
	// If the window has moved
	if(windowXOffset !== window.screenX || windowYOffset !== window.screenY) {
		var xDiff = window.screenX - windowXOffset;
		var yDiff = window.screenY - windowYOffset;
		// Make closest update to new offsets given known information
		totalXOffset += xDiff;
		totalYOffset += yDiff;
		windowXOffset += xDiff;
		windowYOffset += yDiff;
		// Get a correct calibration off next mouse move, should only matter if chrome header resized
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
	// Listen for messages from background page
	chrome.runtime.onMessage.addListener(messageListener);

	// Listeners for target events, these bubble up from their source element
	document.addEventListener('click', genericEventHandler);
	document.addEventListener('dblclick', genericEventHandler);
	document.addEventListener('cut', genericEventHandler);
	document.addEventListener('copy', genericEventHandler);
	document.addEventListener('paste', genericEventHandler);
	document.addEventListener('contextmenu', genericEventHandler);
	document.addEventListener('keydown', genericEventHandler)
	modify();

	// Wait for initial calibration
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

	// Set mouse listeners on specific elements once the page has stopped loading new elements
	var observer = new MutationObserver(DomDebounce);
	var config = {
		subtree: true,
		childList: true
	};
	observer.observe(document, config);
}

/*
After MUTATION_TIMEOUT milliseconds of no DOM mutations, make modifications.
This is needed because some page changes don't refresh the page (initial setup won't rerun),
but new actions may be needed (document listeners will persist so don't need to be added like this).
Kind of like a debounce function but it waits until signals have stopped before firing.
*/
function DomDebounce(mutations) {
	if(debounceTimeout === null) { // First DOM change in a while? Set the timer
		debounceTimeout = setTimeout(function(){
			modify();
			debounceTimeout = null;
		}, MUTATION_TIMEOUT);
	} else { // Timer was already running? Clear it and set a new one (reset to MUTATION_TIMEOUT remaining)
		clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(function(){
			modify();
			debounceTimeout = null;
		}, MUTATION_TIMEOUT);
	}
}

// Add mouseenter/mouseleave listeners to any present targets
function modify() {
	//addMouseListeners();
	indexDiffs(); // This will trigger the observer again!
	debounceTimeout = null; // Cancel the timeout from ^
}

function addMouseListeners() {
	for(var identifier in getCurrentTargets()) {
		// Ugly hardcoding. Don't add mouse listeners to any code elements
		if(identifier === 'table > tbody > tr' || identifier.includes('td.blob')) {
			continue;
		}
		var found = $(identifier);
		for(var item of found) {
			item.addEventListener('mouseenter', genericEventHandler);
			item.addEventListener('mouseleave', genericEventHandler);
		}
	}
	// In place of lines of code, attempt to add listeners to file containers
	var files = $('div.file');
	for(var item of files) {
		item.addEventListener('mouseenter', githubFileMouseEventHandler);
		item.addEventListener('mouseleave', githubFileMouseEventHandler);
	}
}

function indexDiffs() {
	$('div.file').each(function(index) {
		$(this).attr('diffIndex', index);
		indexLines(this);
	});
}

function indexLines(div) {
	var i = 0;
	$(div).find('div.blob-wrapper > table.diff-table > tbody > tr').each(function(ignored) {
		if(!$(this).hasClass('blob-expanded')) {
			$(this).attr('originalindex', i);
			i++;
		}
	})
}

/*************************
Event Monitoring Functions
*************************/

// Handles any 'addEventListener' style events
function genericEventHandler(event) {
	for(var identifier in getCurrentTargets()) {
		var found = $(event.target).closest(identifier);
		if(found.length) {
			var obj = eventInteractionObject(event.type, getTargetDescription(identifier, found))
			chrome.runtime.sendMessage(obj);
			break;
		}
	}
}

// Handles the mouseenter/leave events for files since they aren't in the normal list
function githubFileMouseEventHandler(event, target) {
	var obj = eventInteractionObject(event.type, getTargetDescription('div.file', event.target));
	chrome.runtime.sendMessage(obj);
}

/************************
Gaze Monitoring Functions
************************/

function handleNewGaze(x, y) {
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
	checkForTargetChange(targettedIdentifier, targettedElement);
}

// Checks if viewed pixel is a new element of interest (file/code, comments, etc), logs if it is
function checkForTargetChange(targettedIdentifier, targettedElement) {
	try {
		if(lastTarget && targettedElement) { // Past and current element are both targets
			if(!(lastTarget.is(targettedElement))) {
				handleGazeEvent(targettedElement, targettedIdentifier, null);
			} 
		} else if (lastTarget || targettedElement) { // Only one is/was is a target, definitely changed
			handleGazeEvent(targettedElement, targettedIdentifier, null);
		}
	} catch (e) {
		console.log('Something went wrong parsing ' + targettedIdentifier + ':');
		console.log(targettedElement);
		console.log(e.message);
		// If somehthing goes wrong, set last gaze to null so it never gets stuck on a bad element
		lastTarget = null;
		lastIdentifier = null;
	}
};

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
	var obj = {
		'comType': 'event',
		'type': 'gazeLoss',
		'timestamp': timestamp
	}
	chrome.runtime.sendMessage(obj);
}

// For when background.js requests diff info because a gaze fell on a diff
function getDiffData(file) {
	var filename = "Unknown filename";
	var diffIndex = "Unknown index";
	var rows = [];

	try {
		filename = $(file).find('div.file-header > div.file-info > a').attr('title');
		diffIndex = $(file).attr('diffIndex');
		rows = $(file).find('div.blob-wrapper > table.diff-table > tbody > tr');
	} catch (e) {
		// Ignore
	}
	if(rows.length < 1) {
		return null;
	}
	var rowData = [];
	rows.each(function(index) {
		try {
			var elem = $(this);
			var additionComponent;
			var deletionComponent;
			var unchangedComponent;
			if(!isCodeLine(elem)) {
				if(isExpandableLine(elem)) {
					rowData.push(getTargetDescription('table > tbody > tr.js-expandable-line', elem));
				} else if (isInlineComment(elem)) {
					rowData.push(getTargetDescription('table > tbody > tr.inline-comments', elem));
				} else {
					rowData.push(getTargetDescription('table > tbody > tr', elem));
				}
			} else {
				additionComponent = diffLineDetails(elem, 'addition');
				deletionComponent = diffLineDetails(elem, 'deletion');
				unchangedComponent = diffLineDetails(elem, 'unchanged');
				// In split diff, can be addition, deletion, both, or neither (unchanged)
				// deletion must be pushed first to match unified diff
				if(deletionComponent) {
					rowData.push(deletionComponent);
				}
				if(additionComponent) {
					rowData.push(additionComponent);
				}
				if(unchangedComponent) {
					rowData.push(unchangedComponent);
				}
			}
		} catch (e) {
			// Don't push anything
		}
		
	});
	return {
		'file': filename,
		'diffIndex': diffIndex,
		'pageHref': window.location.href,
		'allLineDetails': rowData
	};
}

/******************************
Target Labelling/Data Gathering
******************************/

// How to lable the target. Null is untracked, some elements have single lable, some have variable labels
// key is a key from the target objects, elem is a jQuery object
function getTargetDescription(key, elem) {
	if(key == null) {
		return 'Untracked';
	}
	switch(key) {
		case 'div.file': // Github file (inc diffs)
			return 'File: ' + $(elem).find('div.file-header > div.file-info > a').attr('title');
		case 'li.commit': // Github commit
			var data = elem.attr('data-channel');
			var split = data.split(':');
			var commitID = split[split.length - 1];
			return 'Commit: id - ' + commitID;
		case 'li.js-issue-row': // Github issue in list
			var title = $(elem).find('div > div > a.h4').text().trim();
			var spanContent = $(elem).find('div > div > div > span.opened-by').text();
			var numberStr = spanContent.trim().split('\n')[0];
			return 'Issue/Pull request: ' + numberStr + ', ' + title;
		case 'div.g': // Google search result
			var link = $(elem).find('div > div.rc > h3.r > a').text().trim();
			if(link == '') {
				return 'Google result special element';				
			}
			return 'Google result: ' + link;
		case 'a.diff-expander':
			return expandbleLineDetail('Expandable line button', $(elem).closest('tr.js-expandable-line'));
		case 'td.blob-code-addition':
		case 'td.blob-num-addition':
			return diffLineDetails(elem.closest('tr'), 'addition');
		case 'td.blob-code-deletion':
		case 'td.blob-num-deletion':
			return diffLineDetails(elem.closest('tr'), 'deletion');
		case 'td.blob-code-context':
		case 'td.blob-num-context':
			return diffLineDetails(elem.closest('tr'), 'unchanged');
		case 'table > tbody > tr.blob-expanded':
			return diffLineDetails(elem, 'expanded');
		case 'table > tbody > tr.js-expandable-line':
			return expandbleLineDetail('Expandable line details', elem);
		case 'table > tbody > tr.inline-comments':
			return diffCommentDetail(elem);
		case 'table > tbody > tr':
			if(isCodeMarker(elem)) { // Other row type with no distinguishing feature
				return expandbleLineDetail('File start marker', elem);
			}
			try {
				return fileLineDetail(elem)
			} catch (e) {
				return 'Untracked table row'; // Just in case
			}
		default: // Used assigned label mapping in 'targets' global
			return getCurrentTargets()[key];
	}
}

// Get the specifics of a line of code (line numbers, code text)
// elem is a row, type is 'addition', 'deletion', 'unchanged', or 'expanded'
function diffLineDetails(elem, type) {
	var file = getDiffRowFile(elem);
	var diffIndex = $(elem).closest('div.file').attr('diffIndex');
	var format;
	if($(elem).closest('table').hasClass('file-diff-split')) {
		format = 'split';
	} else {
		format = 'unified';
	}
	// Line nums will be null if not present (addition or deletion lines)
	var oldLineNum = $(elem).find('td.blob-num')[0].getAttribute('data-line-number');
	var newLineNum = $(elem).find('td.blob-num')[1].getAttribute('data-line-number');
	var indentType = 'none'; // space, tab, or none
	var indentValue = 0;
	var codeElem;
	var codeText;
	switch(type) {
		// Return null if the specified type doesn't exist in this row
		// These have to be different for split view where you can have multiple blob-code-inner in same row
		case 'addition':
			var codeElem = $(elem).find('td.blob-code-addition > span.blob-code-inner');
			break;
		case 'deletion':
			var codeElem = $(elem).find('td.blob-code-deletion > span.blob-code-inner');
			break;
		case 'unchanged':
			var codeElem = $(elem).find('td.blob-code-context > span.blob-code-inner');
			break;
		case 'expanded':
			var codeElem = $(elem).find('td.blob-code-inner');
			break;
		default: // Hopefully never happens
			return null;
	}
	if(codeElem.length < 1) {
		return null;
	}
	if(type === 'unchanged' || type === 'expanded') { // 2 copies of code
			codeText = codeElem.first().text();
	} else {
			codeText = codeElem.text();
	}
	if(codeText !== '') {
		codeText = codeText.substring(1); // Remove +, -, or space
		if(codeText[0] === '\t') {
			indentType = 'tab';			
		} else if(codeText[0] === ' ') {
			indentType = 'space';
		}
		if(indentType !== 'none') {
			indentValue = indentationValue(codeText);
		}
		codeText = codeText.trim();
	}
	return {
		'target': 'diffCode',
		'isDiffLine': true,
		'index': parseInt(elem.attr('originalindex')),
		'indexLive': elem.index(),
		'file': file,
		'diffIndex': diffIndex,
		'format': format,
		'change': type,
		'oldLineNum': oldLineNum,
		'newLineNum': newLineNum,
		'length': codeLengthNoWhitespace(codeText),
		'indentType': indentType,
		'indentValue': indentValue,
		'codeText': codeText
	};
}

// Details in the expandable separator lines in a diff (source is the button or the line)
function expandbleLineDetail(source, elem) {
	var diffIndex = $(elem).closest('div.file').attr('diffIndex');
	var obj = {
		'target': source,
		'isDiffLine': true,
		'index': parseInt(elem.attr('originalindex')),
		'indexLive': elem.index(),
		'file': getDiffRowFile(elem),
		'diffIndex': diffIndex
	};
	var text = elem.text().trim();
	var lineRegex = new RegExp('\\d+,\\d+', 'g');
	var res1 = lineRegex.exec(text);
	var res2 = lineRegex.exec(text);
	if(res1 && res2) {
		var oldNums = res1[0].split(',');
		obj['oldStart'] = parseInt(oldNums[0]);
		obj['oldEnd'] = parseInt(oldNums[0]) + parseInt(oldNums[1]);
		var newNums = res2[0].split(',');
		obj['newStart'] = parseInt(newNums[0]);
		obj['newEnd'] = parseInt(newNums[0]) + parseInt(newNums[1]);
		if(!isCodeMarker(elem)) {
			obj['codeText'] = text.substring(text.lastIndexOf('@@') + 2).trim();
		} else {
			obj['codeText'] = '';
		}
	} else { // Expandable lines at bottom of file with no info, or unknown format
		obj['oldStart'] = null;
		obj['oldEnd'] = null;
		obj['newStart'] = null;
		obj['newEnd'] = null;
		obj['codeText'] = '';
	}
	return obj;
}

function diffCommentDetail(elem) {
	var diffIndex = $(elem).closest('div.file').attr('diffIndex');
	var hashedContent = stringHash($(elem).find('div.comment-body > p').text());
	return {
		'target': 'Inline diff comment',
		'isDiffLine': true,
		'index': parseInt(elem.attr('originalindex')),
		'indexLive': elem.index(),
		'file': getDiffRowFile(elem),
		'diffIndex': diffIndex,
		'hashedContent': hashedContent
	}
}

function fileLineDetail(elem) {
	var filename = $(elem).closest('div.repository-content').find('strong.final-path').text();
	// Line nums will be null if not present (addition or deletion lines)
	var lineNum = $(elem).find('td.blob-num')[0].getAttribute('data-line-number');
	var indentType = 'none'; // space, tab, or none
	var indentValue = 0;
	var codeElem = $(elem).find('td.blob-code-inner');
	codeText = codeElem.text();
	if(codeText[0] === '\t') {
		indentType = 'tab';			
	} else if(codeText[0] === ' ') {
		indentType = 'space';
	}
	if(indentType !== 'none') {
		indentValue = indentationValue(codeText);
	}
	codeText = codeText.trim();
	return {
		'target': 'fileCode',
		'file': filename,
		'lineNum': lineNum,
		'length': codeLengthNoWhitespace(codeText),
		'indentType': indentType,
		'indentValue': indentValue,
		'codeText': codeText
	};
}

/****************
Object Generators
****************/

// For events fired by event listeners
function eventInteractionObject(type, target) {
	var obj = {
		'comType': 'event',
		'type': type
	};
	// If just a string, set that as the target. If object, incorporate all properties (inc. target)
	if(typeof target !== 'string') {
		for(var key in target) {
			obj[key] = target[key];
		}
	} else {
		obj['target'] = target;
	}
	// These all could be set at declaration but it would change the key order, useful when looking at data manually
	obj['timestamp'] = Date.now();
	obj['domain'] = window.location.hostname;
	obj['pageHref'] = window.location.href;
	obj['pageType'] = labelPageType();
	return obj;
}

// For gazes on a target
function gazeInteractionObject(target, start, end) {
	var obj = {
		'comType': 'event',
		'type': 'gaze'
	};
	// If just a string, set that as the target. If object, incorporate all properties (inc. target)
	if(typeof target !== 'string') {
		for(var key in target) {
			obj[key] = target[key];
		}
	} else {
		obj['target'] = target;
	}
	// These all could be set at initial declaration but it would change the key order,
	// keeping the order is useful when looking at data manually
	obj['timestamp'] = start;
	obj['timestampEnd'] = end;
	obj['duration'] = end - start;
	obj['domain'] = window.location.hostname;
	obj['pageHref'] = window.location.href;
	obj['pageType'] = labelPageType();
	return obj;
}

// For gazes on an untracked (no specified target elements) page
function pageViewObject() {
	return {
		'comType': 'event',
		'type': 'pageView',
		'timestamp': gazeStart,
		'timestampEnd': lastGaze,
		'duration': lastGaze - gazeStart,
		'domain': window.location.hostname
	}
}

// Substitute for data being sent from eyetracker, sends cursor position to server
function imposterGazeEvent(xPos, yPos) {
	var obj = {
		'comType': 'gaze',
		'x': xPos,
		'y': yPos,
		'timestamp': Date.now()
	};
	chrome.runtime.sendMessage(obj);
}

/***************
Helper Functions
***************/

function labelPageType() {
	for(var key in pageTypeRegex) {
		if(pageTypeRegex[key].test(window.location.href)) {
			return key;
		}
	}
	return 'Unlabeled page';
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

// Returns number of nonwhitespace characters in a string
function codeLengthNoWhitespace(code) {
	if(code) {
		var chars = code.replace(/\s/g,"");
		return chars.length;
	}
	return 0;
}

// Number of indentation elements (space or tab) at the start of a line
// 'code' is assumed to have indentation elements, or this method wouldn't have been called
function indentationValue(code) {
	var depth = 0;
	var i = 0;
	while(i < code.length && code[i] === code[0]) {
		depth++;
		i++
	}
	return depth;
}

// These are the blue lines in diffs that are NOT expandable
function isCodeMarker(elem) {
	// [0] is to extract the HTML element for the hasAttribute method. Uglier to check with jQuery
	return elem[0].hasAttribute('data-position') && !elem.hasClass('js-expandable-line');
}

function isExpandableLine(elem) {
	return elem.hasClass('js-expandable-line');
}

function isInlineComment(elem) {
	return elem.hasClass('inline-comments');
}

function notDiff(elem) {
	return !elem.closest('table').hasClass('diff-table');
}

function changeType(elem) {
	if(elem.hasClass('blob-code-addition') || elem.hasClass('blob-num-addition')) {
		return 'addition';
	} else if(elem.hasClass('blob-code-deletion') || elem.hasClass('blob-num-deletion')) {
		return 'deletion';
	} else {
		return 'unchanged';
	}
}

function isCodeLine(elem) {
	if(isExpandableLine(elem) || isCodeMarker(elem) || isInlineComment(elem)) {
		return false;
	}
	return true;
}

function getDiffRowFile(row) {
	var fileString = getTargetDescription('div.file', row.closest('div.file')); // Format 'File: filename.ext'
	return fileString.substring(6); // Cut out 'File: ' added by getTargetDescription
}

// From http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
function stringHash(string) {
	var hash = 0;
	if (string.length == 0) {
		return hash;
	}
	for (i = 0; i < string.length; i++) {
		char = string.charCodeAt(i);
		hash = ((hash<<5)-hash)+char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return hash;
}