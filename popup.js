$(document).ready(function() {
	var bg = chrome.extension.getBackgroundPage();

	$('#tabs').tabs();

	if(bg.sessionId) {
		$('p > span#session-id').text(bg.sessionId);
		$('button#start').css('display', 'inline');
		$('button#stop').css('display', 'inline');
	}

	if(bg.privateMode) {
		$('input#private-mode').prop('checked', true);
	}

	for(var id of bg.privacyFilters) {
		$('input#' + id).prop('checked', true);
	}

	$('button#set-session').click(function(e) {
		e.preventDefault();
		var session = $('input#session-field').val();
		$('p > span#session-id').text(session);
		bg.sessionId = session;
		bg.setLocal('sessionId', session);
		$('button#start').css('display', 'inline');
		$('button#stop').css('display', 'inline');
	});

	$('button#start').click(function(e) {
		e.preventDefault();
		bg.startReporting();
	});

	$('button#stop').click(function(e) {
		e.preventDefault();
		bg.stopReporting();
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

	$('input.privacy').click(function(e) {
		var checked = [];
		$('input.privacy').each(function(index) {
			if($(this).is(':checked')) {
				checked.push($(this).attr('id'))
			}
		})
		console.log(JSON.stringify(checked));
		bg.updatePrivacySettings(JSON.stringify(checked));
	})
})