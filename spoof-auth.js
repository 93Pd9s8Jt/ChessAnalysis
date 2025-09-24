// ==UserScript==
// @name         Spoof auth on Chess.com
// @namespace    Violentmonkey Scripts
// @version      0.1
// @description  Spoofs token requests so Chess.com thinks you can analyse the game
// @author       You
// @match        https://www.chess.com/*/review
// @grant        none
// @run-at       document-start
// ==/UserScript==

(async function() {
    'use strict';

    // Save the original XMLHttpRequest constructor
    const originalXMLHttpRequest = window.XMLHttpRequest;

    // Create a new XMLHttpRequest constructor
    function ModifiedXMLHttpRequest() {
        const xhr = new originalXMLHttpRequest();

        // Store the original onreadystatechange handler
        const originalOnReadyStateChange = xhr.onreadystatechange;

        // Override the onreadystatechange property to modify the response before it's used
        xhr.onreadystatechange = function() {
            // If the request has finished (readyState 4), check if it's the right URL
            if (xhr.readyState === 4 && xhr.status === 200 || xhr.status === 403) {
                const url = xhr.responseURL;
                // Check if this is the right API URL
                if (url.match(/^https:\/\/www\.chess\.com\/callback\/analysis\/game\/live\/\d+\/all$/)) {
                    try {
                        // Parse the JSON response
                        const jsonResponse = JSON.parse(xhr.responseText);

                        // Check if the response has the structure we want to modify
                        if (jsonResponse.data === null &&
                            Array.isArray(jsonResponse.selfAnalysis) &&
                            jsonResponse.selfAnalysis.length === 0 &&
                            jsonResponse.pgn === null &&
                            jsonResponse.analysisLogExists === false) {

                            // Modify the 'analysisLogExists' field to true
                            jsonResponse.analysisLogExists = true;

                            // Convert the modified object back to a JSON string
                            const modifiedResponseText = JSON.stringify(jsonResponse);

                            // Use Object.defineProperty to make responseText writable
                            Object.defineProperty(xhr, 'responseText', {
                                value: modifiedResponseText,
                                writable: true
                            });
                            xhr.responseText = modifiedResponseText;  // Modify the response property as well
                            console.log("Spoofed analysisLogExists")
                        }
                    } catch (e) {
                        console.error('Failed to modify response:', e);
                    }
                } else if (url.match(/^https:\/\/www\.chess\.com\/callback\/auth\/service\/analysis\?game_id=\d+&game_type=live$/)) {
                     try {
                       console.log(xhr);


                        // Convert the modified object back to a JSON string
                        const modifiedResponseText = JSON.stringify({"token": "tokenabc"});

                        // Use Object.defineProperty to make responseText writable
                        Object.defineProperty(xhr, 'responseText', {
                            value: modifiedResponseText,
                            writable: true
                        });
                        xhr.responseText = modifiedResponseText;  // Modify the response property as well
                       Object.defineProperty(xhr, 'status', {
                            value: 200,
                            writable: true
                        });
                       xhr.status = 200;
                       console.log("Spoofed chess.com auth token")

                    } catch (e) {
                        console.error('Failed to modify response:', e);
                    }
                }
            }

            // Call the original onreadystatechange handler (if any)
            if (originalOnReadyStateChange) {
                originalOnReadyStateChange.apply(xhr, arguments);
            }
        };

        return xhr;
    }

    // Replace the XMLHttpRequest constructor with the modified one
    window.XMLHttpRequest = ModifiedXMLHttpRequest;

  //analysis.data.metaData.clientRequest.source.token = placeholderToken
  var progressInterval;
  if (false && window.WebSocket.prototype._originalSend === undefined) {
        window.WebSocket.prototype._originalSend = window.WebSocket.prototype.send;
        window.WebSocket.prototype.send = function(data) {
            const wsInstance = this;
            // console.log('INTERCEPTED WebSocket.prototype.send for URL:', wsInstance.url);
            // console.log('Data being sent:', data); // Can be very verbose

            if (wsInstance.url && wsInstance.url.startsWith("wss://analysis.chess.com")) {
                console.log("This is an analysis WebSocket send call!");
                try {
                    const message = JSON.parse(data);
                    if (message.action === "gameAnalysis" && message.game && message.game.pgn) {
                        console.log("Caught gameAnalysis action via prototype.send.");
                        console.log(message.game.pgn)

                        // Ensure the original onmessage handler is available
                        const originalOnMessage = wsInstance.onmessage;
                        if (!originalOnMessage) {
                            console.warn("No onmessage handler on this WS instance yet. Progress spoofing might not work immediately.");
                        }

                        // Start spoofing progress
                        let currentProgress = 0;
                        if (progressInterval) clearInterval(progressInterval);

                        progressInterval = setInterval(() => {
                            if (wsInstance.readyState !== WebSocket.OPEN) {
                                 console.warn("Prototype send: WebSocket not open, stopping progress interval.");
                                 clearInterval(progressInterval);
                                 return;
                            }
                             if (!wsInstance.onmessage) { // Check again in case it was set later
                                console.warn("Progress interval: onmessage handler not yet set on wsInstance.");
                                return;
                            }


                            currentProgress += 0.1; // Increment by 1%
                            currentProgress = parseFloat(currentProgress.toFixed(2));

                            const progressMessage = {
                                action: "progress",
                                progress: currentProgress,
                                engineType: "spoofed_engine_v0.4",
                                strength: "Fast" // Or map based on local engine depth
                            };
                            console.log("Sending SPOOFED progress via prototype.send:", progressMessage.progress);
                            // Call the original onmessage with the spoofed data
                            // Ensure 'this' context is correct for the handler
                            if (wsInstance.onmessage) {
                                wsInstance.onmessage.call(wsInstance, { data: JSON.stringify(progressMessage) });
                            }


                            if (currentProgress >= 0.9) {
                                clearInterval(progressInterval);
                                console.log("Spoofed progress complete. Sending DUMMY final analysis and done.");
                                //let analysis = JSON.parse(prompt("analysis"))
                                //console.log(analysis)

                                const dummyFinalAnalysis =  {"action": "analyzeGame", "data": {}};
                                if (wsInstance.onmessage) wsInstance.onmessage.call(wsInstance, { data: JSON.stringify(dummyFinalAnalysis) });

                                setTimeout(() => {
                                    if (wsInstance.readyState === WebSocket.OPEN && wsInstance.onmessage) {
                                        const doneMessage = { action: "done" };
                                        console.log("Sending SPOOFED done message via prototype.send.");

                                        wsInstance.onmessage.call(wsInstance, { data: JSON.stringify(doneMessage) });
                                    }
                                }, 100);
                            }
                        }, 100); // Send progress update every 1 second

                        // IMPORTANT: Do NOT call the original send for this specific message
                        // as we are handling it entirely by spoofing.
                        console.log("Preventing original send for gameAnalysis message.");
                        return;
                    } else {
                        console.log("Analysis WebSocket: Unhandled action or message structure:", message.action);
                    }
                } catch (e) {
                    console.error("Error in prototype.send interceptor for analysis WS:", e, data);
                }
            }
            // For other WebSockets or unhandled messages, call the original send
            return wsInstance._originalSend.apply(this, arguments);
        };
        console.log("Patched WebSocket.prototype.send");
    } else {
        console.log("WebSocket.prototype.send already patched.");
    }


})();
