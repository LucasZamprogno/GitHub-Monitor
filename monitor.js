var pastElem = null; // store the currently selected element
var origBorder = ""; // stores the border settings of the selected element
var lastTarget = null; // Previous element of interest
var xOffset = null; // Difference between document x and screen pixel x
var yOffset = null; // Difference between document y and screen pixel y
var serverAwake = false;
var targets = { // Keys are target elements, values are descriptors
	"div.file": "Special case, won't see this",
	"div#all_commit_comments": "Comment section"
};

document.body.addEventListener("mousemove", calibrate);
// These intervals will cancel themselves upon confirmation
var echoLoop = setInterval(function() {confirmServerAwake(echoLoop);}, 50);
var start = setInterval(function() {startupMain(start)}, 50);

// Calculates document/pixel offsets, begins polling for coordinates, removes itself as a listener when complete
function calibrate(event) {
	xOffset = event.screenX - event.clientX;
    yOffset = event.screenY - event.clientY;
    console.log("Calibrated, xOffset = " + xOffset + " yOffset = " + yOffset);
	// Remove this listener
    document.body.removeEventListener("mousemove", calibrate);
}

function confirmServerAwake(self) {
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function(event) {
		if (xhr.readyState == 4 && xhr.status == 200) {
	        serverAwake = true
	        console.log("Echo responded");
	        // Stop attempting to reach server
	        clearInterval(self);
	    }
	};
	xhr.open('GET', "https://localhost:4321/echo", true);
	xhr.send();
}

function startupMain(self) {
	if(serverAwake && xOffset !== null && yOffset !== null) { // Need to specify null in case of 0 offset
		setInterval(function() { getNewCoordFromServer() }, 17); // 16.66... is 60hz, so this is just below.
	    // Temp
	    document.body.addEventListener("mousemove", function(event){
		    postDataToServer(event.clientX, event.clientY);
		});
	    console.log("Now listening");
		clearInterval(self);
	}
}

// Gets the most specific element at target location
function getViewedElement(x, y) {
	var currentElem = document.elementFromPoint(x, y);

	// This block is only useful for the highlighting, will be removed eventually
    if (pastElem) {
        if (pastElem == currentElem) {
            return;
        }
        pastElem.style.border = origBorder;
        pastElem = null;
    }
    
    if (currentElem && currentElem.tagName.toLowerCase() != "body" && currentElem.tagName.toLowerCase() != "html") {
        pastElem = currentElem;
        origBorder = currentElem.style.border;
        //currentElem.style.border = "2px solid red"; // draws selection border
        checkForTargetChange(currentElem);
    }
}

// Checks if viewed pixel is a new element of interest (file/code, comments, etc), logs if it is
function checkForTargetChange(viewed) {
	var toPrint = "Untracked";
	var targettedIdentifier = null;
	var targettedElement = null;

	// Check each target key to see if currently viewed element is a child of it
	for(var identifier of Object.keys(targets)) {
		var found = $(viewed).closest(identifier);
		// If the viewed element has a target parent
		if(found.length) {
			targettedIdentifier = identifier;
			targettedElement = found;
			break;
		}
	}
	
	if(lastTarget && targettedElement) { // Past and current element are targets
		if(!(lastTarget.is(targettedElement))) { // New target, report change (eventually a different function probably)
			lastTarget = targettedElement;
			console.log(getTargetDescription(targettedIdentifier, targettedElement));
		} 
	} else if (lastTarget || targettedElement) { // Only one is/was is a target, definitely changed
		lastTarget = targettedElement;
		console.log(getTargetDescription(targettedIdentifier, targettedElement));
	} // else null and null, no change
};

// How to lable the target. Null is untracked, some elements have single lable, some have variable labels
function getTargetDescription(key, elem) {
	if(key == null) {
		return "Untracked";
	}
	switch(key) {
		case "div.file": // There can be multiple file divs in a commit, check which file
			return "File: " + $(elem).find("div.file-header > div.file-info > a").attr("title");
		default: // Used assigned label mapping in targets global
			return targets[key];
	}
}

// GET request, current gets x and y coordinate. Will include more details (e.g. timestamp) in the future
function getNewCoordFromServer() {
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function(event) {
		if (xhr.readyState == 4 && xhr.status == 200) {
	        var response = JSON.parse(xhr.responseText);
	        getViewedElement(response.x, response.y);
	    }
	};
	xhr.open('GET', "https://localhost:4321/coordinate", true);
	xhr.send();
}

// Substitute for data being sent from eyetracker, sends cursor position to server
function postDataToServer(xPos, yPos) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open("POST", "https://localhost:4321/coordinate");
	xmlhttp.setRequestHeader("Content-Type", "application/json");
	xmlhttp.send(JSON.stringify({x:xPos, y:yPos}));
}