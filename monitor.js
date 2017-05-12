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

    if (pastElem) {  // if there was previously selected element
        if (pastElem == currentElem) {  // if mouse is over the previously selected element
            return; // does not need to update the selection border
        }
        pastElem.style.border = origBorder;  // set border to the stored value
        pastElem = null;
    }
        // the body and the html tag won't be selected
    if (currentElem && currentElem.tagName.toLowerCase() != "body" && currentElem.tagName.toLowerCase() != "html") {
        pastElem = currentElem; // stores the selected element
        origBorder = currentElem.style.border; // stores the border settings of the selected element
        //currentElem.style.border = "2px solid red";    // draws selection border
        checkForTarget(currentElem);
        //getNewCoordFromServer();
    }
}

function checkForTarget(viewed) {
	// Check each target key to see if currently viewed element is a child of it
	var toPrint = "Untracked";
	var targettedIdentifier = null;
	var targettedElement = null;

	for(var identifier of Object.keys(targets)) {
		var found = $(identifier).has(viewed);
		// If the viewed element has a target parent
		if(found.length) {
			targettedIdentifier = identifier;
			targettedElement = found;
			break;
		}
	}

	// If the viewed target has changed, print it
	if(lastTarget !== targettedIdentifier) {
		lastTarget = targettedIdentifier;
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


console.log("~~~~~~ EVERYTHING LOADED FINE ~~~~~~~");