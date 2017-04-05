// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/*
 *      UI Modifier
 */
function renderStatus(statusText) {
  if (statusText == undefined) { 
    var statusText = "I'm working, please do not change tab or close me.\n" + "Downloaded " + download_count.toString() + "/" + expected_download_count.toString(); 
    if (download_count == expected_download_count && download_count > 0) {
      var button = document.getElementById('download-button');
      button.disabled = false;
      statusText = "All Done"
    }
  }
  document.getElementById('status').textContent = statusText;
}

function setBookName(bookName) {
  document.getElementById('book-name').innerText = bookName;

}

/*
 *      Chrome utility wrapper
 */

function getCurrentTab(callback) {
  var queryInfo = {
    active: true,
    currentWindow: true
  };

  chrome.tabs.query(queryInfo, function(tabs) {
    var tab = tabs[0];
    callback(tab);
  });
}

function createTabInBackground(url, callback) {
  // Create new tab, wait until it is loaded and save the page
  chrome.tabs.create({
    url: url,
    active : false
  }, function(tab) {
    chrome.tabs.onUpdated.addListener(function func(tabId, changeInfo) {
        if (tabId == tab.id && changeInfo.status == 'complete') {
            chrome.tabs.onUpdated.removeListener(func);
            callback(tab.id);
        }
    });
  });

}



function getBookNameFromUrl(book_url) {
    var re = new RegExp('https://www.safaribooksonline.com/library/view/(\.+)/\\d+/\.*');

    var book_match = re.exec(book_url);
    if (book_match == null) {
        return null;
    }
    var book_name = book_match[1];
    return book_name
}

function saveUrls(url_name_map) {
  // Termination condition, when url_name_map is empty
  var keys = Object.keys(url_name_map)
  if ( keys.length == 0) {
    return
  }
  var url = keys[0];
  var file_name = url_name_map[url];
  delete url_name_map[url];

  // Use promise to ensure one tab will finish download before next tab starts
  // This can save memory on low memory machine
  var promise = new Promise(
    function(resolve, reject) {
      createTabInBackground(url, 
        function saveTab(tabId) {
          chrome.pageCapture.saveAsMHTML({ tabId: tabId }, 
            // Save page blob
            function saveMhtml(mhtml){
              saveAs(mhtml, file_name + '.mhtml');
              chrome.tabs.remove(tabId);
              download_count++;
              renderStatus();
              // Finish current download job, 
              // Resolve and pass the map to next iteration
              resolve(url_name_map);
            }
          );
        }
      ); 
    }
  );
  promise.then(saveUrls);
}

function downloadButtonCallback(chapter_list_url) {
    var button = document.getElementById('download-button');
    button.disabled = true;
    renderStatus();

    createTabInBackground(chapter_list_url, function (tabId) {
      function downloadBook(url_name_map_json) {
        console.log("Received url_name_map_json:")
        console.log(url_name_map_json);
        chrome.tabs.remove(tabId);

        url_name_map = JSON.parse(url_name_map_json);

        expected_download_count += Object.keys(url_name_map).length;
        renderStatus();

        saveUrls(url_name_map);
      }

      chrome.tabs.sendMessage(tabId, {text: 'get_url_name_map'}, downloadBook);

    })
}

var download_count = 0;
var expected_download_count = 0;


function getBookNameArray(urls)
{
  var names = "";

  for (var i = 0 ; i < urls.length ; i++)
    names += i+1 + ". " + getBookNameFromUrl(urls[i]) + "\n";

  return names;
}

function isInQuenePage(url)
{
  var re = new RegExp('(\.+://www.safaribooksonline.com/s/)\.*');
  var match = re.exec(url);

  var re2 = new RegExp('(\.+://www.safaribooksonline.com/s/\\?limit=100)\.*');
  var match2 = re2.exec(url);

  if(match != null && match2 != null)
    return 2;     // return 2 if the page has loaded 100 books in the Safari Queue page
  else if (match != null)
    return 1;     // return 1 if the page is in Safari Queue page
  else 
    return 0;     // return 0 if the page is NOT in Safari Queue page
}

function clickedEvent(url)
{
  var re = new RegExp('(\.+://www.safaribooksonline.com/library/view/\.+/\\d+/)\.*');
  var match = re.exec(url);

  if (match != null) {
    book_url = match[1] + "#toc";
    downloadButtonCallback(book_url);
  }
  else {
    renderStatus("Unknown url, not able to get book chapter url");
  }
}

document.addEventListener('DOMContentLoaded', function() {
  var button = document.getElementById('download-button');
  var loadAllInQueueButton = document.getElementById('load-all-in-queue-button');
  button.disabled = true;
  loadAllInQueueButton.disabled = false;

  getCurrentTab(function(tab) {
    var book_name;

    chrome.tabs.onUpdated.addListener(function(tabId , info) {
      if(tabId == tab.id && info.status == "complete"){
        location.reload();
        window.close();
      }
    });

    loadAllInQueueButton.addEventListener('click', function() {
      
        chrome.tabs.executeScript( null, {code: "location.href='https://www.safaribooksonline.com/s/?limit=100'; "}, 
          function() {
            loadAllInQueueButton.textContent = "Loading...";
            loadAllInQueueButton.disabled = true;
          });
      

    });

    if (isInQuenePage(tab.url))
    {
      loadAllInQueueButton.disabled = isInQuenePage(tab.url) == 2 ? true : false;

      var urls = [];
      chrome.tabs.executeScript( null, {
        code: "var b = []; a = document.getElementsByClassName('next title-block js-bit-title t-bit-link'); for (var i = 0 ; i < a.length ; i++) b[i] = 'https://www.safaribooksonline.com' + a[i].getAttribute('href'); b"
      }, function(results){ 

        urls = results[0];
        setBookName("Warning! If you click the 'Download' button in this page, all books in the Safari Quene will be downloaded.\n\n" + 
          "Books that can be downloaded :\n" +
        getBookNameArray(urls));
      
        chrome.tabs.executeScript(null, {file: "content.js"});

        var button = document.getElementById('download-button');
        button.disabled = false;

        button.addEventListener('click', function() {
            for (var i = 0 ; i < urls.length ; i++ ) {
              book_name = getBookNameFromUrl(urls[i]);    
              clickedEvent(urls[i]);
            }
        });


      
      });
    }
    else 
    {
      book_name = getBookNameFromUrl(tab.url);
      if (book_name == null) {
        setBookName("Unable to get book name, please change another url and try again")
        return;
      }
      else {
        setBookName(book_name);
      }
    
      // Inject content script and button callback
      chrome.tabs.executeScript(null, {file: "content.js"});

      var button = document.getElementById('download-button');
      button.disabled = false;
      button.addEventListener('click', function() {
        clickedEvent(tab.url);
      });
    }

  })
});


