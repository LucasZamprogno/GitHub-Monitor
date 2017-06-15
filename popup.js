$(document).ready(function() {
	var bg = chrome.extension.getBackgroundPage();

	$('#tabs').tabs();

	// Make all info in the popup up to date with saved data
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

	// Click handlers
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
		var obj = {
			'type': 'setting',
			'detail': 'Privacy setting - ' + state,
			'timestamp': Date.now(),
			'override': true
		};
		chrome.runtime.sendMessage(obj);
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
		bg.updatePrivacySettings(JSON.stringify(checked));
	})
})