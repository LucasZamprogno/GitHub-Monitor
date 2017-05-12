// Codeblock slightly adapted from http://help.dottoro.com/ljctoqhf.php
var pastElem = null; // store the currently selected element
var origBorder = ""; // stores the border settings of the selected element
var lastTarget = null;
var targets = {
	"div.file": "Special case, won't see this",
	"div#all_commit_comments": "Comment section"
};

document.body.addEventListener("mousemove", function(event){
    postDataToServer(event.clientX, event.clientY);
});

setInterval(function() { getNewCoordFromServer() }, 17); // 16.66... is 60hz, so this is just below.

function getViewedElement(x, y) {
	var currentElem = document.elementFromPoint(x, y);

	// This comparison is only useful for the highlighting, will be removed eventually
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
        checkForTarget(currentElem);
    }
}

function checkForTarget(viewed) {
	// Check each target key to see if currently viewed element is a child of it
	var toPrint = "Untracked";
	var targettedIdentifier = null;
	var targettedElement = null;

	for(var identifier of Object.keys(targets)) {
		var found = $(viewed).closest(identifier);
		// If the viewed element has a target parent
		if(found.length) {
			targettedIdentifier = identifier;
			targettedElement = found;
			break;
		}
	}
	
	if(lastTarget && targettedElement) { // Both are targets
		if(!(lastTarget.is(targettedElement))) { // New target, report change (eventually a different function probably)
			lastTarget = targettedElement;
			console.log(getTargetDescription(targettedIdentifier, targettedElement));
		} 
	} else if (lastTarget || targettedElement) { // Only is a target, definite change
		lastTarget = targettedElement;
		console.log(getTargetDescription(targettedIdentifier, targettedElement));
	}
};

function getTargetDescription(key, elem) {
	if(key == null) {
		return "Untracked";
	}
	switch(key) {
		case "div.file":
			return "File: " + $(elem).find("div.file-header > div.file-info > a").attr("title");
		default:
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


// Will not be how things actually work
function postDataToServer(xPos, yPos) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.open("POST", "https://localhost:4321/coordinate");
	xmlhttp.setRequestHeader("Content-Type", "application/json");
	xmlhttp.send(JSON.stringify({x:xPos, y:yPos}));
}