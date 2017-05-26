document.addEventListener('DOMContentLoaded', function(){
	document.getElementById('only-thing').addEventListener('click', function(){
		chrome.runtime.sendMessage({'foo': 'bar'});
	});
});