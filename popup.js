$(document).ready(function() {
	// Check background status
	var statusElement = $('p > span#status');
	var sessionElement = $('p > span#session-id');
	var bg = chrome.extension.getBackgroundPage();

	if(bg.sessionId) {
		console.log(typeof bg.sessionId);
		sessionElement.text(bg.sessionId);
	}

	if(bg.reporting) {
		statusElement.text('Running');
	} else {
		statusElement.text('Stopped');
	}

	if(bg.privateMode) {
		$('input#private-mode').prop('checked', true);
	}

	$('button#set-session').click(function(e) {
		e.preventDefault();
		var session = $('input#session-field').val();
		sessionElement.text(session);
		bg.sessionId = session;
		bg.setLocal('sessionId', session);
	});

	$('button#start').click(function(e) {
		e.preventDefault();
		bg.startReporting();
		statusElement.text('Running');
	});

	$('button#stop').click(function(e) {
		e.preventDefault();
		bg.stopReporting();
		statusElement.text('Stopped');
	});

	$('input#private-mode').click(function(e) {
		var state = $('input#private-mode').is(':checked');
		bg.privateMode = state;
		bg.setLocal('privateMode', state);
	})
})