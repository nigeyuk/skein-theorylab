# MIDI

Phase 02 uses native Web MIDI for input from class-compliant controllers. MIDI starts disabled and the user enables it from the virtual keyboard. Access requests use `sysex: false`. A supported browser and a secure context are required. On a denied request or an unsupported browser, the pointer and computer keyboard remain available.

The adapter lists connected inputs and listens to the selected port. The browser stores an explicitly selected device ID locally. With no preference, the adapter uses the first connected input. A missing preferred port is reopened when it reconnects. MIDI enablement, channel and octave-follow settings last for the current app session.

The adapter decodes note-on, note-off, zero-velocity note-on, CC64 sustain, CC120 All Sound Off and CC123 All Notes Off. Presses and sustain are scoped to the selected input and MIDI channel. Switching filters or devices, disabling MIDI or unplugging the selected device releases its voices. The dock's **All notes off** button clears MIDI pedal state and releases every input source and queued audition.

The shared note input manager publishes source, pitch and normalised velocity to subscribers. MIDI origins also identify the device and channel. Workspaces can restrict input and visual feedback independently. MIDI note numbers map to sounding pitches in the theory core, while any written spelling is chosen by the receiving workspace.

## Manual USB controller acceptance test

1. Connect a class-compliant USB MIDI controller. Serve MyTheoryLab at localhost or over HTTPS in a browser with Web MIDI.
2. Open **Intervals** and check MIDI is disabled before any interaction. Click **Enable MIDI**, allow the browser request and confirm the dock shows the controller name. Choose the controller and a channel. Reload, reenable MIDI and confirm the preferred device is selected.
3. Play notes softly and firmly, then play a chord. Confirm the notes sound with different levels and the matching keys highlight. Select **Use keyboard** for the second interval note and confirm a MIDI press changes that note. Open **Chords** and confirm a MIDI press changes the root.
4. Hold a computer piano key and play the same pitch on the controller. Release the controller key first and confirm the computer key continues sounding until released. Send on a channel outside the filter and confirm that no note sounds or highlights.
5. Hold CC64 sustain, press and release several notes, then lift the pedal. Sustained notes should release together. Turn on **Follow MIDI octaves** and play outside the current range. Confirm the dock moves to show the note.
6. Unplug with held and sustained notes. Confirm the sound stops and the dock reports the disconnected preference. Reconnect and confirm the port resumes. Test **All notes off** and **Disable MIDI** with active notes.
7. Deny MIDI permission in a clean browser session and check the status. Confirm pointer and computer piano input still work. Repeat the fallback check in a browser without Web MIDI support.

Advanced control mapping, MIDI output and deeper hardware integration remain future work.
