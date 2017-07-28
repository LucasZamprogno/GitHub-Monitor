var mouseInput = false; // Using the mouse to fake gaze data?
var MUTATION_TIMEOUT = 200; // Time to wait for DOM mutations to finish
var PAGE_VIEW_TIME = 500; // How long user can look away before a page gaze is 'finished'
var githubTargets = { // Some pretty useless things are commented out in case we want them later
	// General/shared
	//'div.header': 'Main github header',
	//'div.repohead': 'Repo header',
	//'div.branch-select-menu > div.select-menu-modal-holder': 'Branch selection menu',
	'a.diff-expander': 'Special case, won\'t see this', // Diff separator expansion button
	'table.diff-table > tbody > tr': 'Special case, won\'t see this', // Code
	'div.comment': 'Comment',
	'form.js-new-comment-form': 'New comment form',
	// Main repo page
	'div.file-wrap': 'Repo file explorer',
	'div#readme': 'Repo README',
	//'div.overall-summary': 'Landing page repo header (Commits, branches, etc.)',
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
	'div.kp-blk': 'Related searches',
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

/**************************
Startup variables/listeners
**************************/
var calibrated = false;
var lastZoom = null;
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
		case 'diff':
			if(request['pageHref'] !== window.location.href) {
				return; // User left the page already
			}
			var diffInfo = {
				'comType': 'diff',
				'type': 'diff',
				'pageHref': request['pageHref'],
				'file': request['file']
			};
			$('div.file').each(function(index) {
				var filename = $(this).find('div.file-header > div.file-info > a').attr('title');
				if(filename === request['file']) {
					var data = extractMetadata(this);
					for(var key in data) {
						diffInfo[key] = data[key];
					}
					chrome.runtime.sendMessage(diffInfo);
					return false; // break each loop
				} else {
					return true; // continue in to next each loop iteration
				}
			});
			break;
	}
}

function extractMetadata(elem) {
	var rows = $(elem).find('div.js-file-content > div.data > table.diff-table > tbody > tr');
	if(rows.length < 1) {
		return null;
	}
	var lengths = [];
	var indentations = [];
	var additions = 0;
	var deletions = 0;
	var unchanged = 0;
	var indentType = 'none';
	rows.each(function(index) {
		try {
			var line = githubLineDetails(this);
			lengths.push(line['length']);
			indentations.push(line['indentValue']);
			if(line['indentType'] !== 'none') {
				if(indentType === 'none') {
					indentType = line['indentType'];
				} else if(line['indentType'] !== indentType) {
					indentType = 'mixed';
				}
			}
			switch(line['change']) {
				case 'addition':
					additions++;
					break;
				case 'deletion':
					deletions++;
					break;
				case 'unchanged':
					unchanged++;
					break;
			}
		} catch (e) {
			return true; // invalid line, skip
		}
	});
	var totalLines = additions + deletions + unchanged;
	return {
		'totalLines': totalLines,
		'additionPercentage': additions / totalLines,
		'deletionPercentage': deletions / totalLines,
		'unchangedPercentage': unchanged / totalLines,
		'indentType': indentType,
		'medianIndent': median(indentations),
		'minIndent': Math.min.apply(Math, indentations), // From https://stackoverflow.com/questions/1669190/find-the-min-max-element-of-an-array-in-javascript
		'maxIndent': Math.max.apply(Math, indentations),
		'medianLength': median(lengths),
		'minLength': Math.min.apply(Math, lengths),
		'maxLength': Math.max.apply(Math, lengths)
	};
}

function median(arr) {
	arr.sort(function(a,b){return a-b;});
	if(arr.length === 0) {
		return 0;
	}
	var mid = Math.floor(arr.length/2);
	if(arr.length % 2) { // Odd
		return arr[mid]
	} else {
		return (arr[mid - 1] + arr[mid]) / 2;
	}
}

// Calculates document/pixel offsets, begins polling for coordinates, removes itself when complete
function calibrate(event) {
	if(lastZoom) { // Needed for calibration
		totalXOffset = event.screenX - (event.clientX * lastZoom);
		totalYOffset = event.screenY - (event.clientY * lastZoom);
		console.log('Calibrated, totalXOffset = ' + totalXOffset + ', totalYOffset = ' + totalYOffset);
		recalibrationInterval = setInterval(function() { recalibrate() }, 1000);
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
	// Listen for messages from background page
	chrome.runtime.onMessage.addListener(messageListener);

	// Listeners for target events, these bubble up from their source
	document.addEventListener('click', genericEventHandler);
	document.addEventListener('dblclick', genericEventHandler);
	document.addEventListener('cut', genericEventHandler);
	document.addEventListener('copy', genericEventHandler);
	document.addEventListener('paste', genericEventHandler);
	document.addEventListener('contextmenu', genericEventHandler);
	document.addEventListener('keydown', genericEventHandler)
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
	// This is needed because some page changes don't refresh the page, and new listeners may be needed
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
	// In place of lines of code, attempt to add listeners to file containers
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

// Handles the mouseenter/leave events for files since they aren't in the normal list
function bitbucketFileMouseEventHandler(event, target) {
	var obj = eventInteractionObject(event.type, getTargetDescription('div.diff-container', event.target));
	chrome.runtime.sendMessage(obj);
}

// Object creating funciton just for cleanliness
function eventInteractionObject(type, target) {
	var obj = {
		'comType': 'event',
		'type': type
	};
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

// Get the specifics of a line of code (line numbers, code text)
function githubLineDetails(elem) {
	var fileString = getTargetDescription('div.file', elem.closest('div.file')); // Format 'File: filename.ext'
	var file = fileString.substring(6); // Cut out 'File: '
	// Line nums will be null if not present (addition or deletion lines)
	var oldLineNum = $(elem).find('td.blob-num')[0].getAttribute('data-line-number');
	var newLineNum = $(elem).find('td.blob-num')[1].getAttribute('data-line-number');
	var codeElem = $(elem).find('td.blob-code');
	var codeText = codeElem.find('span.blob-code-inner').text();
	var type;
	var indentType = 'none'; // space, tab, or none
	var indentValue = 0;
	if(codeElem.hasClass('blob-code-context')) {
		type = 'unchanged';
	} else if(codeElem.hasClass('blob-code-addition')) {
		type = 'addition';
	} else if(codeElem.hasClass('blob-code-deletion')) {
		type = 'deletion';
	} else { // Hopefully shouldn't happen
		type = 'unknown';
		codeText = '';
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
		'target': 'code',
		'file': file,
		'change': type,
		'oldLineNum': oldLineNum,
		'newLineNum': newLineNum,
		'length': codeLengthNoWhitespace(codeText),
		'indentType': indentType,
		'indentValue': indentValue,
		'codeText': codeText
	};
}

function codeLengthNoWhitespace(code) {
	if(code) {
		var chars = code.replace(/\s/g,"");
		return chars.length;
	}
	return 0;
}

function indentationValue(code) {
	var depth = 0;
	var i = 0;
	while(i < code.length && code[i] === code[0]) {
		depth++;
		i++
	}
	return depth;
}

function expandbleLineDetail(source, elem) {
	console.log(elem);
	var obj = {
		'target': source
	};
	var text = elem.text().trim()
	var lineRegex = new RegExp('\\d+,\\d+', 'g');
	var lines = lineRegex.exec(text)[0].split(',');
	obj['oldStart'] = parseInt(lines[0]);
	obj['oldEnd'] = parseInt(lines[0]) + parseInt(lines[1]);
	lines = lineRegex.exec(text)[0].split(',');
	obj['newStart'] = parseInt(lines[0]);
	obj['newEnd'] = parseInt(lines[0]) + parseInt(lines[1]);
	obj['codeText'] = text.substring(text.lastIndexOf('@@') + 2).trim();
	return obj;
}

// Get the specifics of a line of code (line numbers, code text)
function bitbucketLineDetails(elem) {
	var type;
	var fileString = getTargetDescription('div.diff-container', elem.closest('div.diff-container')); // Format 'File: filename.ext'
	var file = fileString.substring(6) // Cut out 'File: '
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
		'file': file,
		'change': type,
		'oldLineNum': oldLineNum,
		'newLineNum': newLineNum,
		'codeText': codeText
	};
}

// For gazes on a target
function gazeInteractionObject(target, start, end) {
	var obj = {
		'comType': 'event',
		'type': 'gaze'
	};
	if(typeof target !== 'string') {
		for(var key in target) {
			obj[key] = target[key];
		}
	} else {
		obj['target'] = target;
	}
	// These all could be set at declaration but it would change the key order, useful when looking at data manually
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

/**************
Other Functions
**************/

function labelPageType() {
	for(var key in pageTypeRegex) {
		if(pageTypeRegex[key].test(window.location.href)) {
			return key;
		}
	}
	return 'Unlabeled page';
}

// How to lable the target. Null is untracked, some elements have single lable, some have variable labels
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
			var name = $(elem).find('p.commit-title > a').attr('title');
			return 'Commit: id - ' + commitID + ', name - ' + name;
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
		case 'table.diff-table > tbody > tr': // Github Diff code line
			if(elem.hasClass('js-expandable-line')) {
				return expandbleLineDetail('Expandable line details', elem);
			} else if(elem[0].hasAttribute('data-position')) {
				return "File start/end marker";
			}
			return githubLineDetails(elem);
		case 'div.diff-container': // Bitbucket diff file
			var header = $(elem).find('div.heading > div.primary > h1.filename');
			header = $(header).contents().filter(function() { // Ignore <span>s
				return this.nodeType == 3;
			}).text().trim();
			return 'File: ' + header;
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