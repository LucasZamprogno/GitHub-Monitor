$(document).ready(function() {
	var bg = chrome.extension.getBackgroundPage();

	$('#tabs').tabs();

	// Make all info in the popup up to date with saved data
	if(bg.sessionId) {
		$('p > span#session-id').text(bg.sessionId);
		disableIdField();
	} else {
		$('div#reporting').css('display', 'none');
		enableIdField();
	}

	if(bg.privateMode) {
		$('input#private-mode').prop('checked', true);
	}

	if(bg.gazeLossInterval) {
		$('span#status').text('Communicating');
	} else {
		$('span#status').text('Not communicating');
	}

	if(bg.reporting) {
		$('button#stop').css('display', 'inline')
		$('button#start').css('display', 'none');
	} else {
		$('button#start').css('display', 'inline')
		$('button#stop').css('display', 'none');
	}

	for(var id of bg.privacyFilters) {
		$('input#' + id).prop('checked', true);
	}

	// Click handlers
	$('button#set-session').click(function(e) {
		e.preventDefault();
		var session = $('input#session-field').val();
		$('p > span#session-id').text(session);
		bg.sessionId = session;
		bg.setLocal('sessionId', session);
		$('div#reporting').css('display', 'inline');
		disableIdField();
	});

	$('button#change-session').click(function(e) {
		enableIdField();
	})

	$('button#start').click(function(e) {
		e.preventDefault();
		$('button#stop').css('display', 'inline')
		$(this).css('display', 'none');
		bg.startReporting();
	});

	$('button#stop').click(function(e) {
		e.preventDefault();
		$('button#start').css('display', 'inline')
		$(this).css('display', 'none');
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
		if($('textarea#report-area').val() !== '') {
			var obj = {
				'type': 'comment',
				'timestamp': Date.now(),
				'message': $('textarea#report-area').val()
			};
			$('textarea#report-area').val('');
			chrome.runtime.sendMessage(obj);		
		}
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

function enableIdField() {
	$('button#set-session').css('display', 'inline');
	$('input#session-field').css('display', 'inline');
	$('button#change-session').css('display', 'none');
}

function disableIdField() {
	$('button#change-session').css('display', 'inline');
	$('button#set-session').css('display', 'none');
	$('input#session-field').css('display', 'none');	
}

// Listen for updates on the eye tracker's connection from background.js
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if(!sender.hasOwnProperty('tab')) {
		if(request['status'] === 'connected') {
			$('span#status').text('Communicating');
		} else if(request['status'] === 'disconnected') {
			$('span#status').text('Not communicating');
		}
	}
});