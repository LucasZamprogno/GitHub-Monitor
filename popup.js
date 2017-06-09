$(document).ready(function() {
	var bg = chrome.extension.getBackgroundPage();

	if(bg.sessionId) {
		$('p > span#session-id').text(bg.sessionId);
		$('button#start').css('visibility', 'visible');
		$('button#stop').css('visibility', 'visible');
	}

	if(bg.privateMode) {
		$('input#private-mode').prop('checked', true);
	}

	$('button#set-session').click(function(e) {
		e.preventDefault();
		var session = $('input#session-field').val();
		$('p > span#session-id').text(session);
		bg.sessionId = session;
		bg.setLocal('sessionId', session);
		$('button#start').css('visibility', 'visible');
		$('button#stop').css('visibility', 'visible');
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
	});

	$('button#report-button').click(function(e) {
		e.preventDefault();
		var obj = {
			'type': 'comment',
			'timestamp': Date.now(),
			'message': $('textarea#report-area').val()
		};
		$('textarea#report-area').val('');
		chrome.runtime.sendMessage(obj);
	});
})