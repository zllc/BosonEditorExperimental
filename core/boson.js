/*
 * Boson.js core
 * This handles all core app things.
*/

var gui = require('nw.gui');
var menu = require(process.cwd() + '/core/modules/menu.js');
var keybindings = require(process.cwd() + '/core/modules/keybindings.js');
var livepreview = require(process.cwd() + '/core/modules/livepreview.js');
var menubar = require(process.cwd() + '/core/modules/menubar.js');
var fs = require('fs');
var path = require('path');
var args = window.gui.App.argv;
var child = require('child_process');

(function(window,config) {

  var boson = {
    current_editor: null,
    title: "Boson Editor",
    working_dir: process.env.PWD,
    maxFileSize: 5242880,
    version: "0.1",
    sidebarActive: true
  }, elements = {}, editor = [], tabs = [], dom, editorData = [], win, cancelEvents = {};

  this.preloadDom = function() {
    elements.editorEntryPoint = document.getElementById("editor-entrypoint");
    elements.tabsEntryPoint = document.getElementById("tabs-entrypoint");
    elements.bodyEntryPoint = document.getElementById("body-entrypoint");
    elements.selectFilesInput = document.getElementById("boson-select-files");
    elements.footerEntryPoint = document.getElementById("footer-entrypoint");
    elements.projectRoot = document.getElementById("project-root-list");
    elements.saveFilesInput = document.getElementById("boson-save-file");
    elements.sidebar = document.getElementById("sidebar-entrypoint");
    elements.topbar = document.getElementById("topbar-entrypoint");

    //Hook on change selectFilesInput.
    elements.selectFilesInput.addEventListener("change", function(res){
      bs.attemptOpenFiles(this.value);
    }, false);

  };

  this.toggleSidebar = function() {

    if ( boson.sidebarActive === true ) {
      elements.sidebar.className = "sidebar-deactivated";
      elements.editorEntryPoint.className = "editor-fullscreen";
      elements.topbar.className = "topbar-fullscreen";
      boson.sidebarActive = false;
    } else {
      elements.sidebar.className = "";
      elements.editorEntryPoint.className = "";
      elements.topbar.className = "";
      boson.sidebarActive = true;
    }

  };

  this.setFontSize = function( size ) {

    elements.editorEntryPoint.style.fontSize = size + "px";

  };

  this.increaseFontSize = function() {

    config.fontSize = config.fontSize + 1;
    bs.setFontSize( config.fontSize );

  };

  this.decreaseFontSize = function() {

    config.fontSize = config.fontSize - 1;
    bs.setFontSize( config.fontSize );

  };

  this.log = function(buffer) {

    console.log(buffer);

  };

  this.handleCancelEvents = function() {

    var key;

    for ( key in cancelEvents ) {
      if ( cancelEvents[key].active === true ) {
        if ( typeof cancelEvents[key].callback === "function" ) {
          cancelEvents[key].callback();
        }
      }
    }

  };

  this.addCancelEvent = function( name, callback ) {

    cancelEvents[name] = {
      active: true,
      callback: callback
    };

  };

  this.suspendCancelEvent = function ( name ) {

    if ( cancelEvents.hasOwnProperty(name) ) {
      cancelEvents[name].active = false;
    }

  };

  this.attemptOpenFiles = function( fp ) {

    var files;

    //Split the string, check if multiple files have been selected.
    files = fp.split(";");

    for ( key in files ) {
      bs.openFileFromPath( files[key] );
    }

  };

  this.openFileFromPath = function( fp ) {

    var key, cfp, currentFileId, dialogueMessage, saveFunc;

    if ( typeof fp === "undefined" || fp === "" ) {
      bs.bsError("Tried to open file with blank filepath.");
      return;
    }

    //Is the file currently open?
    for ( key in editorData ) {
      cfp = editorData[key].cwd + "/" + editorData[key].name;
      if ( cfp === fp ) {
        //File is already open.
        bs.log("File already open, switching to tab.");
        bs.switchToEditor( key );
        return;
      }
    }

    //Open the file.
    fs.exists(fp, function (exists) {
      if ( exists ) {

        //Is the file too big?
        fs.stat(fp, function(err,data){

          if ( err ) {
            bs.bsError(err);
            return;
          }

          var openFunc = function(){

            //Open the file buffer.
            fs.readFile(fp, {
              encoding: "utf-8"
            }, function(err, data){

              if ( err ) {
                bs.bsError("There was an error opening " + fp);
                return;
              }

              currentFileId = editorData.length;

              //Open new tab.
              editorData.push({
                name: path.basename(fp),
                guid: fp,
                cwd: path.dirname(fp),
                buffer: data
              });

              this.createEditor(editorData[currentFileId], currentFileId, true);

            });

          };

          if ( data.size > boson.maxFileSize ) {

            var popup = this.createPopupDialogue("Open big file?", "The file you are trying to open is pretty big.", "Open it", "Don't open it", function(){
              openFunc();  
              bs.suspendCancelEvent( "Open big file?" );
            }, function(){
              //On cancel.
              bs.suspendCancelEvent( "Open big file?" );
            }, null);

            bs.addCancelEvent( "Open big file?", function() {
              bs.removePopupDialogue( popup );
              bs.suspendCancelEvent( "Open big file?" );
            });

          } else {
            openFunc();
          }


        });

        

      } else {
        bs.bsError("Tried to open file that doesn't exist, " + fp);
        return;
      }
    });

  };

  this.openFileDialogue = function() {

    elements.selectFilesInput.click();

  };

  this.createNewFile = function() {

    var i;

    editorData.push({
      name: "New document",
      guid: "new-document",
      cwd: boson.working_dir,
      buffer: ""
    });

    i = editorData.length - 1;

    bs.createEditor({
      guid: "",
      buffer: "",
      name: "New document"
    }, i, true);

  };

  this.registerDragDrop = function() {

    nativesortable(elements.tabsEntryPoint, {
      change: function(){
        
      },
      childClass: "sortable-child",
      draggingClass: "sortable-dragging",
      overClass: "sortable-over"
    });

  };

  this.createTab = function(object, i) {

    var tab, title, close;

    tab = document.createElement("li");
    tab.id = "tab-" + object.guid;
    tab.setAttribute("draggable", "true");

    title = document.createElement("span");
    title.innerHTML = object.name;

    close = document.createElement("span");
    close.className = "close";
    
    tab.appendChild(title);
    tab.appendChild(close);
    tab.setAttribute("data-name", object.name);

    //Hook onclick.
    tab.onclick = function(e) {
      e.preventDefault();
      bs.switchToEditor(i);
    };

    close.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      bs.closeTabById(i);
    };

    elements.tabsEntryPoint.appendChild( tab );

    tabs[i] = {
      tab: tab,
      title: title
    };

  };


  this.activateTab = function(i) {
    if ( boson.current_editor !== null && boson.current_editor !== false ) {
      tabs[boson.current_editor].tab.className = "";
    }
    tabs[i].tab.className =  "active";

  }

  this.createEditor = function(object, i, activateOnComplete) {

    var textarea, cmMode, m, mode, spec;

    //Create the textarea.
    textarea = document.createElement("textarea");
    textarea.id = "ta-" + object.guid;
    textarea.value = object.buffer;

    //Create a tab.
    this.createTab(object, i);

    //Inject into DOM.
    elements.editorEntryPoint.appendChild(textarea);

    //Try to find file type mode for CM.
    if ( m = /.+\.([^.]+)$/.exec( editorData[i].name ) ) {
      var info = CodeMirror.findModeByExtension(m[1]);
      if (info) {
        mode = info.mode;
        spec = info.mime;
      }
    } else if (/\//.test(editorData[i].name)) {
      var info = CodeMirror.findModeByMIME(val);
      if (info) {
        mode = info.mode;
        spec = editorData[i].name;
      }
    } else {
      mode = spec = editorData[i].name;
    }

    if (! mode ) {
      mode = "text";
    }

    //Create the editor.
    editor[i] = {
      cm: CodeMirror.fromTextArea(textarea, {
        lineNumbers: true,
        theme: config.theme,
        autoCloseBrackets: true,
        tabSize: config.tabSize,
        indentWithTabs: config.indentWithTabs
      }),
      ta: textarea,
      mode: mode,
      changed: false
    };

    //Hide the editor.
    editor[i].cm.getWrapperElement().style.display = "none";

    //Create on change hook for save notifications.
    editor[i].cm.on("change", function(cm) {
      if ( editor[i].changed === false ) {
         this.flagHasChanged(i, true);
      }
    });

    if ( typeof activateOnComplete !== "undefined" ) {
      if ( activateOnComplete === true ) {
        bs.switchToEditor(i);
      }
    }

    editor[i].cm.setOption("mode", spec);
    CodeMirror.autoLoadMode(editor[i].cm, mode);

  };

  this.closeEditor = function(i) {

    //Remove the CM element.
    editor[i].cm.toTextArea();

    //Remove the text area.
    editor[i].ta.parentElement.removeChild(editor[i].ta);

    //Remove the tab.
    tabs[i].tab.parentElement.removeChild(tabs[i].tab);


    //Clear the editor object.
    editor[i] = {};
    editorData[i] = {};
    tabs[i] = null;

    boson.current_editor = false;
    bs.setTitle("Nothing open");

    //Find another editor to activate.
    bs.findAndActivateTab(i);

  };

  this.findAndActivateTab = function(i) {

    var newTab = false, max, x;

    max = editorData.length - 1;

    for ( x = max; x >= 0; x-- ) {
      if ( editorData[x].hasOwnProperty('name') ) {
        newTab = x;
        break;
      }
    }

    if ( newTab !== false ) {
      bs.switchToEditor(x);
    }

  };

  this.showEditor = function(i) {

    editor[i].cm.getWrapperElement().style.display = "block";
    editor[i].cm.focus();

  }

  this.hideEditor = function(i) {

    if ( i !== false ) {
      editor[i].cm.getWrapperElement().style.display = "none";
    }

  }

  this.switchToEditor = function(i) {
    if ( boson.current_editor !== i ) {
      if ( boson.current_editor !== null ) {
        this.hideEditor(boson.current_editor)
      }
      this.showEditor(i);
      this.activateTab(i);
      boson.current_editor = i;
      if ( editor[i].changed === true ) {
        this.setTitle( editorData[i].cwd + "/" + editorData[i].name + " *" );
      } else {
        this.setTitle( editorData[i].cwd + "/" + editorData[i].name );
      }
    }
  };

  this.createPopupDialogue = function(title, message, accept, decline, onSuccess, onFailure, i) {

    var popup, popup_cancel_button, popup_logo, popup_title, popup_description, popup_accept_button, popup_decline_button;

    popup = document.createElement("div");
    popup.className = "popup prompt";

    popup_cancel_button = document.createElement("div");
    popup_cancel_button.className = "cancel";

    popup_logo = document.createElement("div");
    popup_logo.className = "logo";

    popup_title = document.createElement("h4");
    popup_title.innerHTML = title;

    popup_description = document.createElement("div");
    popup_description.className = "dialogue";
    popup_description.innerHTML = message;

    popup_accept_button = document.createElement("button");
    popup_accept_button.className = "btn btn-accept";
    popup_accept_button.innerHTML = accept;

    popup_decline_button = document.createElement("button");
    popup_decline_button.className = "btn btn-decline";
    popup_decline_button.innerHTML = decline;

    popup_cancel_button.addEventListener("click", function(e){
      e.preventDefault();
      bs.removePopupDialogue(popup);
      bs.suspendCancelEvent( title );
    });

    popup_accept_button.addEventListener("click", function(e){
      e.preventDefault();
      onSuccess(i);
      bs.removePopupDialogue(popup);
      bs.suspendCancelEvent( title );
    });

    popup_decline_button.addEventListener("click", function(e){
      e.preventDefault();
      onFailure(i);
      bs.removePopupDialogue(popup);
      bs.suspendCancelEvent( title );
    });

    popup.appendChild(popup_cancel_button);
    popup.appendChild(popup_logo);
    popup.appendChild(popup_title);
    popup.appendChild(popup_description);
    popup.appendChild(popup_decline_button);
    popup.appendChild(popup_accept_button);

    elements.bodyEntryPoint.appendChild(popup);

    return popup;

  };

  this.removePopupDialogue = function(popup) {

    popup.className = "popup prompt popOut";
    setTimeout(function() {
      popup.parentElement.removeChild(popup);
    }, 150);

  };

  this.warnSave = function(i, onSuccess, onFailure) {

    var dialogueMessage;

    dialogueMessage = "Do you want to save " + editorData[i].name + " before closing it?";

    return this.createPopupDialogue("Save before closing?", dialogueMessage, "Save", "Don't save", onSuccess, onFailure, i);

  };

  this.closeTabById = function(i) {

    var popup;

    if ( editor[i].changed === true ) {

      //Confirm save.
      popup = this.warnSave(i, function(i){

        //On save.
        bs.saveBufferById(i, function(){
          bs.closeEditor(i);
          bs.suspendCancelEvent( "Save before closing?" );
        });

      }, function(i){

        //On not save.
        bs.closeEditor(i);
        bs.suspendCancelEvent( "Save before closing?" );

      });

      bs.addCancelEvent( "Save before closing?", function(){
        bs.removePopupDialogue( popup );
        bs.suspendCancelEvent( "Save before closing?" );
      });

    } else {
      this.closeEditor(i);
    }

  };

  this.closeCurrentTab = function() {

    var popup;

    if ( boson.current_editor === null || boson.current_editor === false ) {
      return;
    }

    if ( editor[boson.current_editor].changed === true ) {

      //Confirm save.
      popup = this.warnSave(boson.current_editor, function(i){

        //On save.
        bs.saveCurrentBuffer(function(){
          bs.closeEditor(boson.current_editor);
          bs.suspendCancelEvent( "Save before closing?" );
        });

      }, function(i){

        //On not save.
        bs.closeEditor(boson.current_editor);
        bs.suspendCancelEvent( "Save before closing?" );

      });

      bs.addCancelEvent( "Save before closing?", function(){
        bs.removePopupDialogue( popup );
        bs.suspendCancelEvent( "Save before closing?" );
      });

    } else {
      this.closeEditor(boson.current_editor);
    }

  };

  this.bsError = function(err) {
    console.log("BOSON ERROR: " + err);
  };

  this.flagHasChanged = function(i, status) {

    editor[i].changed = status;

    if ( status === true ) {
      //Set both tab title and window title.
      tabs[i].title.innerHTML = tabs[i].tab.getAttribute("data-name") + "*";
      this.setTitle( editorData[i].cwd + "/" + editorData[i].name + " *" );
    } else {
      //Set both tab title and window title.
      tabs[i].title.innerHTML = tabs[i].tab.getAttribute("data-name");
      this.setTitle( editorData[i].cwd + "/" + editorData[i].name );
    }

  };

  this.saveBuffer = function(i, callback, secondcallback) {

    //Save the specified buffer changes to buffer.
    var fh, fileBuffer;

    if ( editorData[i].guid === "new-document" ) {
      //We need a file name first.
      bs.saveFileAs(i, callback);
      return;
    }

    //Sync Codemirror and editorData.
    editorData[i].buffer = editor[i].cm.getValue();

    fileBuffer = editorData[i];

    fs.writeFile( fileBuffer.cwd + "/" + fileBuffer.name, fileBuffer.buffer, function(err){
      if ( err ) {
        this.bsError(err);
      }
      this.log("Saved buffer  to " + fileBuffer.cwd + "/" + fileBuffer.name );

      //Remove the "changed" symbol and flag.
      this.flagHasChanged(i, false);

      if ( typeof callback === "function" ) {
        callback();
      }
      if ( typeof secondcallback === "function" ) {
        secondcallback();
      }

    });

  };

  this.saveFileAs = function() {

    var i, fn, tm;

    if ( boson.current_editor === null || boson.current_editor === false ) {
      return;
    }

    i = boson.current_editor;

    elements.saveFilesInput.addEventListener("change", function(res) {
      
      if ( this.value ) {

        fn = path.basename( this.value );

        tm = (new Date).getTime();

        //Do stuff here.
        editorData[i].cwd = path.dirname( this.value );
        editorData[i].name = fn;
        editorData[i].guid = this.value + "-" + tm;
        
        bs.saveCurrentBuffer();
        tabs[i].tab.setAttribute("data-name", fn );
        tabs[i].title.innerHTML = fn;
        bs.setTitle( this.value );

      }

      this.removeEventListener("change", arguments.callee);

    }, false);

    elements.saveFilesInput.click();
    return;

  };

  this.saveBufferById = function(i, callback) {

    if ( typeof callback === "function" ) {
      this.saveBuffer(i, callback);
    } else {
      this.saveBuffer(i);
    }

  };

  this.saveCurrentBuffer = function(callback) {

    if ( boson.current_editor === null || boson.current_editor === false ) {
      return;
    }
    
    if ( typeof callback === "function" ) {
      this.saveBuffer(boson.current_editor, callback);
    } else {
      this.saveBuffer(boson.current_editor);
    }

  };

  this.setTitle = function(titleBuffer) {

    var proposedTitle;

    proposedTitle = titleBuffer + " - Boson Editor";

    if ( boson.title !== proposedTitle ) {
      //Set title.
      gui.Window.get().title = proposedTitle;
      boson.title = proposedTitle;
    }

  }

  this.debug = function() {
    win.showDevTools();
  };

  this.reinit = function() {
    win.reload();
  };


  this.forkBrowserView = function() {

    var proc, execUri, uri, mode, popup, onSuccess, onFailure;

    if ( boson.current_editor === null || boson.current_editor === false ) {
      return;
    }

    mode = editor[boson.current_editor].mode;

    onSuccess = function() {
      uri = "file://" + editorData[boson.current_editor].cwd + "/" + editorData[boson.current_editor].name;
      execUri = "./boson live-preview " + uri;
      proc = child.exec( execUri );
      bs.suspendCancelEvent( "Unsupported file type" );
    };

    onFailure = function() {
      bs.suspendCancelEvent( "Unsupported file type" );
    };

    if ( mode !== "htmlmixed" ) {

      popup = bs.createPopupDialogue("Unsupported file type", "The file type you're trying to preview is unsupported", "Launch anyway", "Don't launch", onSuccess, onFailure, boson.current_editor);

      bs.addCancelEvent( "Unsupported file type", function() {
        bs.removePopupDialogue( popup );
        bs.suspendCancelEvent( "Unsupported file type" );
      });

      return;
    } else {
      onSuccess();
    }

  };

  this.initLivePreview = function ( url ) {

    livepreview.init(gui,win,this);
    bs.openLivePreviewWindow( url );
    gui.Window.get().close(true);

  };

  this.cmUndo = function() {

    if ( boson.current_editor === null || boson.current_editor === false ) {
      return;
    }

    editor[boson.current_editor].cm.undo();

  };

  this.cmRedo = function() {

    if ( boson.current_editor === null || boson.current_editor === false ) {
      return;
    }

    editor[boson.current_editor].cm.redo();

  };

  this.cmFind = function() {

    if ( boson.current_editor === null || boson.current_editor === false ) {
      return;
    }

    CodeMirror.commands.find(editor[boson.current_editor].cm);

  };

  this.cmReplace = function() {

    if ( boson.current_editor === null || boson.current_editor === false ) {
      return;
    }

    CodeMirror.commands.replace(editor[boson.current_editor].cm);

  };

  this.about = function() {

    var popup, popup_cancel_button, popup_logo, popup_title, popup_description, aboutTxt;

    popup = document.createElement("div");
    popup.className = "popup prompt about"
    popup.id = "popup-about";

    aboutTxt = "Boson Version " + boson.version + "<br /><br />";
    aboutTxt += "Boson is an experimental editor built primarily for web development. It's written in NodeJS, and wrapped in  Nw.js as a runtime container for easy cross-platform integration.<br /><br />";
    aboutTxt += "Boson is still very experimental and should not be considered even close to stable - it's just fun to poke around<br /><br />";
    aboutTxt += "<strong>Credits</strong><br /><br />";
    aboutTxt += "@isdampe - Main developer<br />";
    aboutTxt += "@bgrins - Nativesortable.js library<br />";
    aboutTxt += "Codemirror.net - JS source view library<br />";
    aboutTxt += "Adobe.com - Source sans pro font<br />";
    aboutTxt += "ionicons.com - MIT licensed icons<br />";

    popup_cancel_button = document.createElement("div");
    popup_cancel_button.className = "cancel";

    popup_logo = document.createElement("div");
    popup_logo.className = "logo";

    popup_title = document.createElement("h4");
    popup_title.innerHTML = "About Boson";

    popup_description = document.createElement("div");
    popup_description.className = "about-dialogue";
    popup_description.innerHTML = aboutTxt;

    bs.addCancelEvent( "About", function() {
      bs.removePopupDialogue( popup );
      bs.suspendCancelEvent( "About" );
    });

    popup_cancel_button.addEventListener("click", function(e){
      e.preventDefault();
      bs.removePopupDialogue( popup );
      bs.suspendCancelEvent( "About" );
    });

    popup.appendChild(popup_cancel_button);
    popup.appendChild(popup_logo);
    popup.appendChild(popup_title);
    popup.appendChild(popup_description);

    elements.bodyEntryPoint.appendChild(popup);



    return popup;

  };

  this.init = function() {

    var startupTime, bootUpTime, totalBootTime, i, fileCount;

    //Check command line args.
    if ( args.length > 0 ) {
      if ( args[0] === "live-preview" ) {
        //Launch live preview window.
        if ( args.length > 1 ) {

          bs.initLivePreview( args[1] );

          return;
        }
      }

      boson.working_dir = args[0];
    };

    //Log the startup time.
    startupTime = new Date().getTime();

    //Set Codemirror options.
    CodeMirror.modeURL = "assets/codemirror/mode/%N/%N.js";

    //Preload dom selection.
    this.preloadDom();

    bs.setFontSize( config.fontSize );

    //Fetch window.
    win = gui.Window.get();

    win.on("close", function(){
      bs.closeBoson();
    });

    //Build menus.
    menu.init(gui,win,this,boson,elements);
    keybindings.init(gui,win,this);
    livepreview.init(gui,win,this);
    menubar.init(gui,win,this,boson,elements);

    bs.registerDragDrop();

    //Show the window.
    win.show();

    bootUpTime = new Date().getTime();
    totalBootTime = bootUpTime - startupTime;

    if ( boson.current_editor === null ) {
      if ( fileCount >= 1 ) {
        this.switchToEditor(fileCount -1);
      }
    }

    this.log("Boot complete, " + totalBootTime + " ms");

  };

  this.closeBoson = function() {

    //Is there unsaved buffers?
    //Ask to save, if not, callback.

    //Else
    process.exit(0);

  };

  window.bs = this;
  this.init();

})(window, {
  theme: "tomorrow-night-eighties",
  tabSize: 2,
  indentWithTabs: true,
  fontSize: 24
});