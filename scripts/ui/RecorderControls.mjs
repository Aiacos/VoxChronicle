/**
 * RecorderControls - UI Component for Session Recording
 *
 * A Foundry VTT Application that provides start/stop recording controls
 * for VoxChronicle session capture. Integrates with the SessionOrchestrator
 * for workflow management.
 *
 * @class RecorderControls
 * @augments Application
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';
import { AudioUtils } from '../utils/AudioUtils.mjs';
import { VoxChronicle } from '../core/VoxChronicle.mjs';
import { Settings } from '../core/Settings.mjs';
import { SessionState } from '../orchestration/SessionOrchestrator.mjs';
import { escapeHtml } from '../utils/HtmlUtils.mjs';

/**
 * Recording UI state enum
 * @enum {string}
 */
const RecorderUIState = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PAUSED: 'paused',
  PROCESSING: 'processing',
  ERROR: 'error'
};

/**
 * RecorderControls Application class
 * Provides UI for starting, stopping, pausing, and managing session recordings
 */
class RecorderControls extends Application {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('RecorderControls');

  /**
   * Current UI state
   * @type {string}
   * @private
   */
  _uiState = RecorderUIState.IDLE;

  /**
   * Recording start timestamp
   * @type {number|null}
   * @private
   */
  _recordingStartTime = null;

  /**
   * Duration update interval ID
   * @type {number|null}
   * @private
   */
  _durationInterval = null;

  /**
   * Current progress information
   * @type {object}
   * @private
   */
  _progress = {
    stage: '',
    progress: 0,
    message: ''
  };

  /**
   * Last error message
   * @type {string|null}
   * @private
   */
  _lastError = null;

  /**
   * Get default options for the Application
   * @returns {object} Default application options
   * @static
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'vox-chronicle-recorder',
      title: game.i18n?.localize('VOXCHRONICLE.Recorder.Title') || 'Session Recorder',
      template: `modules/${MODULE_ID}/templates/recorder.hbs`,
      classes: ['vox-chronicle', 'recorder-controls'],
      width: 320,
      height: 'auto',
      minimizable: true,
      resizable: false,
      popOut: true
    });
  }

  /**
   * Create a new RecorderControls instance
   * @param {object} [options] - Application options
   */
  constructor(options = {}) {
    super(options);
    this._setupOrchestratorCallbacks();
    this._logger.debug('RecorderControls initialized');
  }

  /**
   * Set up callbacks for the SessionOrchestrator
   * @private
   */
  _setupOrchestratorCallbacks() {
    const vox = VoxChronicle.getInstance();
    const orchestrator = vox.sessionOrchestrator;

    if (orchestrator) {
      orchestrator.setCallbacks({
        onStateChange: this._onOrchestratorStateChange.bind(this),
        onProgress: this._onOrchestratorProgress.bind(this),
        onError: this._onOrchestratorError.bind(this),
        onSessionComplete: this._onSessionComplete.bind(this)
      });
    }
  }

  /**
   * Handle orchestrator state changes
   * @param {string} newState - New session state
   * @param {string} oldState - Previous session state
   * @param {object} _data - Additional state data
   * @private
   */
  _onOrchestratorStateChange(newState, oldState, _data) {
    this._logger.debug(`Orchestrator state: ${oldState} -> ${newState}`);

    // Map orchestrator state to UI state
    switch (newState) {
      case SessionState.IDLE:
      case SessionState.COMPLETE:
        this._uiState = RecorderUIState.IDLE;
        this._stopDurationTimer();
        break;
      case SessionState.RECORDING:
      case SessionState.LIVE_LISTENING:
      case SessionState.LIVE_TRANSCRIBING:
      case SessionState.LIVE_ANALYZING:
        this._uiState = RecorderUIState.RECORDING;
        if (!this._durationInterval) {
          this._startDurationTimer();
        }
        break;
      case SessionState.PAUSED:
        this._uiState = RecorderUIState.PAUSED;
        break;
      case SessionState.PROCESSING:
      case SessionState.EXTRACTING:
      case SessionState.GENERATING_IMAGES:
      case SessionState.PUBLISHING:
        this._uiState = RecorderUIState.PROCESSING;
        break;
      case SessionState.ERROR:
        this._uiState = RecorderUIState.ERROR;
        this._stopDurationTimer();
        break;
      default:
        this._logger.warn(`Unhandled orchestrator state: ${newState}`);
        break;
    }

    this.render(false);
  }

  /**
   * Handle orchestrator progress updates
   * @param {object} progress - Progress information
   * @private
   */
  _onOrchestratorProgress(progress) {
    this._progress = {
      stage: progress.stage,
      progress: progress.progress,
      message: progress.message
    };
    this.render(false);
  }

  /**
   * Handle orchestrator errors
   * @param {Error} error - The error that occurred
   * @param {string} stage - The stage where the error occurred
   * @private
   */
  _onOrchestratorError(error, stage) {
    this._lastError = error.message;
    this._logger.error(`Error in ${stage}:`, error);
    ui.notifications?.error(game.i18n?.format('VOXCHRONICLE.Errors.Generic') || error.message);
    this.render(false);
  }

  /**
   * Handle session completion
   * @param {object} session - The completed session data
   * @private
   */
  _onSessionComplete(session) {
    this._logger.log('Session complete');
    const segmentCount = session.transcript?.segments?.length || 0;
    ui.notifications?.info(
      game.i18n?.format('VOXCHRONICLE.Notifications.TranscriptionComplete', {
        segments: segmentCount
      }) || `Transcription complete (${segmentCount} segments)`
    );
    this.render(false);
  }

  /**
   * Start the duration timer for UI updates
   * @private
   */
  _startDurationTimer() {
    if (this._durationInterval) {
      clearInterval(this._durationInterval);
    }

    this._recordingStartTime = Date.now();
    this._durationInterval = setInterval(() => {
      this.render(false);
    }, 1000);
  }

  /**
   * Stop the duration timer
   * @private
   */
  _stopDurationTimer() {
    if (this._durationInterval) {
      clearInterval(this._durationInterval);
      this._durationInterval = null;
    }
    this._recordingStartTime = null;
  }

  /**
   * Get the current recording duration in seconds
   * @returns {number} Duration in seconds
   * @private
   */
  _getRecordingDuration() {
    if (!this._recordingStartTime) return 0;
    return Math.floor((Date.now() - this._recordingStartTime) / 1000);
  }

  /**
   * Check local backend health status
   * @returns {Promise<string>} Health status: 'connected', 'checking', or 'unavailable'
   * @private
   */
  async _checkLocalBackendHealth() {
    const vox = VoxChronicle.getInstance();
    const transcriptionService = vox.transcriptionService;

    // Check if service has a health check method (LocalWhisperService does)
    if (transcriptionService && typeof transcriptionService.checkHealth === 'function') {
      try {
        const isHealthy = await transcriptionService.checkHealth();
        return isHealthy ? 'connected' : 'unavailable';
      } catch (error) {
        this._logger.debug('Local backend health check failed:', error);
        return 'unavailable';
      }
    }

    // If no health check method, assume unavailable
    return 'unavailable';
  }

  /**
   * Get data for the template
   * @param {object} _options - Render options
   * @returns {object} Template data
   */
  async getData(_options = {}) {
    const vox = VoxChronicle.getInstance();
    const orchestrator = vox.sessionOrchestrator;
    const sessionSummary = orchestrator?.getSessionSummary();
    const configStatus = Settings.getConfigurationStatus();

    const duration = this._getRecordingDuration();
    const formattedDuration = AudioUtils.formatDuration(duration);

    // Get transcription mode information
    const transcriptionMode = game.settings?.get(MODULE_ID, 'transcriptionMode') || 'auto';
    const showModeIndicator =
      game.settings?.get(MODULE_ID, 'showTranscriptionModeIndicator') !== false;

    // Get mode display info
    let modeLabel, modeTooltip, modeClass, healthStatus, healthClass;
    switch (transcriptionMode) {
      case 'api':
        modeLabel = game.i18n?.localize('VOXCHRONICLE.Recorder.ModeAPI') || 'API';
        modeTooltip =
          game.i18n?.localize('VOXCHRONICLE.Recorder.ModeTooltipAPI') ||
          'Using OpenAI cloud service';
        modeClass = 'mode-api';
        healthStatus = null; // No health status for API mode
        break;
      case 'local':
        modeLabel = game.i18n?.localize('VOXCHRONICLE.Recorder.ModeLocal') || 'Local';
        modeTooltip =
          game.i18n?.localize('VOXCHRONICLE.Recorder.ModeTooltipLocal') ||
          'Using local Whisper backend';
        modeClass = 'mode-local';
        // Check local backend health
        healthStatus = await this._checkLocalBackendHealth();
        healthClass =
          healthStatus === 'connected'
            ? 'health-connected'
            : healthStatus === 'checking'
              ? 'health-checking'
              : 'health-unavailable';
        break;
      case 'auto':
      default:
        modeLabel = game.i18n?.localize('VOXCHRONICLE.Recorder.ModeAuto') || 'Auto';
        modeTooltip =
          game.i18n?.localize('VOXCHRONICLE.Recorder.ModeTooltipAuto') || 'Automatic mode';
        modeClass = 'mode-auto';
        // Check local backend health for auto mode
        healthStatus = await this._checkLocalBackendHealth();
        healthClass =
          healthStatus === 'connected'
            ? 'health-connected'
            : healthStatus === 'checking'
              ? 'health-checking'
              : 'health-unavailable';
        break;
    }

    // Get status text
    let statusText;
    let statusClass = '';
    switch (this._uiState) {
      case RecorderUIState.RECORDING:
        statusText = game.i18n?.localize('VOXCHRONICLE.Recorder.Recording') || 'Recording...';
        statusClass = 'recording';
        break;
      case RecorderUIState.PAUSED:
        statusText = game.i18n?.localize('VOXCHRONICLE.Recorder.Paused') || 'Paused';
        statusClass = 'paused';
        break;
      case RecorderUIState.PROCESSING:
        statusText =
          this._progress.message ||
          game.i18n?.localize('VOXCHRONICLE.Recorder.Processing') ||
          'Processing...';
        statusClass = 'processing';
        break;
      case RecorderUIState.ERROR:
        statusText =
          this._lastError || game.i18n?.localize('VOXCHRONICLE.Errors.Generic') || 'Error';
        statusClass = 'error';
        break;
      default:
        statusText = game.i18n?.localize('VOXCHRONICLE.Recorder.Ready') || 'Ready to record';
        statusClass = 'ready';
    }

    return {
      moduleId: MODULE_ID,
      uiState: this._uiState,
      isIdle: this._uiState === RecorderUIState.IDLE,
      isRecording: this._uiState === RecorderUIState.RECORDING,
      isPaused: this._uiState === RecorderUIState.PAUSED,
      isProcessing: this._uiState === RecorderUIState.PROCESSING,
      isError: this._uiState === RecorderUIState.ERROR,
      canRecord: this._uiState === RecorderUIState.IDLE,
      canStop:
        this._uiState === RecorderUIState.RECORDING || this._uiState === RecorderUIState.PAUSED,
      canPause: this._uiState === RecorderUIState.RECORDING,
      canResume: this._uiState === RecorderUIState.PAUSED,
      statusText,
      statusClass,
      duration: formattedDuration,
      durationSeconds: duration,
      progress: this._progress,
      hasProgress: this._uiState === RecorderUIState.PROCESSING && this._progress.progress > 0,
      sessionSummary,
      configStatus,
      isConfigured: configStatus.ready,
      isOpenAIConfigured: configStatus.openai,
      isKankaConfigured: configStatus.kanka,
      lastError: this._lastError,
      // Transcription mode indicator
      showModeIndicator,
      transcriptionMode,
      modeLabel,
      modeTooltip,
      modeClass,
      healthStatus,
      healthClass,
      // Localization strings
      i18n: {
        title: game.i18n?.localize('VOXCHRONICLE.Recorder.Title') || 'Session Recorder',
        startRecording:
          game.i18n?.localize('VOXCHRONICLE.Recorder.StartRecording') || 'Start Recording',
        stopRecording:
          game.i18n?.localize('VOXCHRONICLE.Recorder.StopRecording') || 'Stop Recording',
        pauseRecording:
          game.i18n?.localize('VOXCHRONICLE.Recorder.PauseRecording') || 'Pause Recording',
        resumeRecording:
          game.i18n?.localize('VOXCHRONICLE.Recorder.ResumeRecording') || 'Resume Recording',
        cancelSession:
          game.i18n?.localize('VOXCHRONICLE.Recorder.CancelSession') || 'Cancel Session',
        duration: game.i18n?.localize('VOXCHRONICLE.Recorder.Duration') || 'Duration',
        status: game.i18n?.localize('VOXCHRONICLE.Recorder.Status') || 'Status',
        segments: game.i18n?.localize('VOXCHRONICLE.Recorder.Segments') || 'Segments:',
        speakers: game.i18n?.localize('VOXCHRONICLE.Recorder.Speakers') || 'Speakers:',
        notConfigured:
          game.i18n?.localize('VOXCHRONICLE.Kanka.NotConfigured') ||
          'Please configure your API keys in module settings.',
        settings: game.i18n?.localize('VOXCHRONICLE.Buttons.Settings') || 'Settings',
        transcriptionMode:
          game.i18n?.localize('VOXCHRONICLE.Recorder.TranscriptionMode') || 'Transcription Mode',
        localBackendConnected:
          game.i18n?.localize('VOXCHRONICLE.Recorder.LocalBackendConnected') ||
          'Local backend connected',
        localBackendChecking:
          game.i18n?.localize('VOXCHRONICLE.Recorder.LocalBackendChecking') ||
          'Checking local backend...',
        localBackendUnavailable:
          game.i18n?.localize('VOXCHRONICLE.Recorder.LocalBackendUnavailable') ||
          'Local backend unavailable'
      }
    };
  }

  /**
   * Activate event listeners for the rendered HTML
   * @param {jQuery} html - The rendered HTML element
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Start recording button
    html.find('[data-action="start-recording"]').on('click', this._onStartRecording.bind(this));

    // Stop recording button
    html.find('[data-action="stop-recording"]').on('click', this._onStopRecording.bind(this));

    // Pause recording button
    html.find('[data-action="pause-recording"]').on('click', this._onPauseRecording.bind(this));

    // Resume recording button
    html.find('[data-action="resume-recording"]').on('click', this._onResumeRecording.bind(this));

    // Cancel session button
    html.find('[data-action="cancel-session"]').on('click', this._onCancelSession.bind(this));

    // Open settings button
    html.find('[data-action="open-settings"]').on('click', this._onOpenSettings.bind(this));

    this._logger.debug('Event listeners activated');
  }

  /**
   * Handle start recording button click
   * @param {Event} event - The click event
   * @private
   */
  async _onStartRecording(event) {
    event.preventDefault();
    await this.startRecording();
  }

  /**
   * Handle stop recording button click
   * @param {Event} event - The click event
   * @private
   */
  async _onStopRecording(event) {
    event.preventDefault();
    await this.stopRecording();
  }

  /**
   * Handle pause recording button click
   * @param {Event} event - The click event
   * @private
   */
  _onPauseRecording(event) {
    event.preventDefault();
    this.pauseRecording();
  }

  /**
   * Handle resume recording button click
   * @param {Event} event - The click event
   * @private
   */
  _onResumeRecording(event) {
    event.preventDefault();
    this.resumeRecording();
  }

  /**
   * Handle cancel session button click
   * @param {Event} event - The click event
   * @private
   */
  _onCancelSession(event) {
    event.preventDefault();
    this.cancelSession();
  }

  /**
   * Handle open settings button click
   * @param {Event} event - The click event
   * @private
   */
  _onOpenSettings(event) {
    event.preventDefault();
    // Open the module settings
    const settingsApp = new SettingsConfig();
    settingsApp.render(true, { focus: true });
  }

  /**
   * Start a new recording session
   *
   * @param {object} [options] - Recording options
   * @param {string} [options.title] - Session title
   * @returns {Promise<void>}
   * @throws {Error} If recording cannot be started
   */
  async startRecording(options = {}) {
    const configStatus = Settings.getConfigurationStatus();

    // Check if OpenAI is configured (required for transcription)
    if (!configStatus.openai) {
      ui.notifications?.warn(
        game.i18n?.localize('VOXCHRONICLE.Errors.ApiKeyMissing') ||
          'OpenAI API key is not configured. Please check module settings.'
      );
      return;
    }

    this._logger.log('Starting recording...');
    this._lastError = null;

    try {
      const vox = VoxChronicle.getInstance();
      const orchestrator = vox.sessionOrchestrator;

      if (!orchestrator) {
        throw new Error('Session orchestrator not available');
      }

      // Prepare session options
      const sessionOptions = {
        title: options.title || `Session ${new Date().toLocaleDateString()}`,
        speakerMap: Settings.getSpeakerLabels(),
        language: Settings.getTranscriptionLanguage(),
        recordingOptions: Settings.getAudioSettings()
      };

      await orchestrator.startSession(sessionOptions);

      ui.notifications?.info(
        game.i18n?.localize('VOXCHRONICLE.Notifications.RecordingStarted') || 'Recording started'
      );

      this._logger.log('Recording started successfully');
    } catch (error) {
      this._logger.error('Failed to start recording:', error);
      this._lastError = error.message;
      this._uiState = RecorderUIState.ERROR;

      ui.notifications?.error(
        game.i18n?.localize('VOXCHRONICLE.Recorder.RecordingFailed') ||
          `Recording failed: ${error.message}`
      );

      this.render(false);
    }
  }

  /**
   * Stop the current recording session
   *
   * @param {object} [options] - Stop options
   * @param {boolean} [options.processImmediately=true] - Process transcription immediately
   * @returns {Promise<object | null>} Session data or null if failed
   */
  async stopRecording(options = {}) {
    if (this._uiState !== RecorderUIState.RECORDING && this._uiState !== RecorderUIState.PAUSED) {
      this._logger.warn('No active recording to stop');
      return null;
    }

    this._logger.log('Stopping recording...');

    try {
      const vox = VoxChronicle.getInstance();
      const orchestrator = vox.sessionOrchestrator;

      if (!orchestrator) {
        throw new Error('Session orchestrator not available');
      }

      const duration = this._getRecordingDuration();
      const sessionData = await orchestrator.stopSession(options);

      ui.notifications?.info(
        game.i18n?.format('VOXCHRONICLE.Notifications.RecordingStopped', {
          duration: AudioUtils.formatDuration(duration)
        }) || `Recording stopped (${AudioUtils.formatDuration(duration)})`
      );

      this._logger.log('Recording stopped successfully');
      return sessionData;
    } catch (error) {
      this._logger.error('Failed to stop recording:', error);
      this._lastError = error.message;

      ui.notifications?.error(
        game.i18n?.localize('VOXCHRONICLE.Recorder.RecordingFailed') ||
          `Failed to stop recording: ${error.message}`
      );

      this.render(false);
      return null;
    }
  }

  /**
   * Pause the current recording
   */
  pauseRecording() {
    if (this._uiState !== RecorderUIState.RECORDING) {
      this._logger.warn('Cannot pause - not recording');
      return;
    }

    this._logger.log('Pausing recording...');

    try {
      const vox = VoxChronicle.getInstance();
      const orchestrator = vox.sessionOrchestrator;

      if (orchestrator) {
        orchestrator.pauseRecording();
      }
    } catch (error) {
      this._logger.error('Failed to pause recording:', error);
      ui.notifications?.error(`Failed to pause: ${error.message}`);
    }
  }

  /**
   * Resume a paused recording
   */
  resumeRecording() {
    if (this._uiState !== RecorderUIState.PAUSED) {
      this._logger.warn('Cannot resume - not paused');
      return;
    }

    this._logger.log('Resuming recording...');

    try {
      const vox = VoxChronicle.getInstance();
      const orchestrator = vox.sessionOrchestrator;

      if (orchestrator) {
        orchestrator.resumeRecording();
      }
    } catch (error) {
      this._logger.error('Failed to resume recording:', error);
      ui.notifications?.error(`Failed to resume: ${error.message}`);
    }
  }

  /**
   * Cancel the current session without saving
   */
  cancelSession() {
    this._logger.log('Cancelling session...');

    try {
      const vox = VoxChronicle.getInstance();
      const orchestrator = vox.sessionOrchestrator;

      if (orchestrator) {
        orchestrator.cancelSession();
      }

      this._uiState = RecorderUIState.IDLE;
      this._lastError = null;
      this._progress = { stage: '', progress: 0, message: '' };
      this._stopDurationTimer();

      this.render(false);
    } catch (error) {
      this._logger.error('Failed to cancel session:', error);
    }
  }

  /**
   * Get the current recording state
   *
   * @returns {object} Current state information
   */
  getState() {
    return {
      uiState: this._uiState,
      isRecording: this._uiState === RecorderUIState.RECORDING,
      isPaused: this._uiState === RecorderUIState.PAUSED,
      isProcessing: this._uiState === RecorderUIState.PROCESSING,
      duration: this._getRecordingDuration(),
      progress: { ...this._progress },
      lastError: this._lastError
    };
  }

  /**
   * Clean up when the application is closed
   * @param {object} options - Close options
   * @returns {Promise<void>}
   */
  async close(options = {}) {
    this._stopDurationTimer();
    return super.close(options);
  }

  /**
   * Render fallback content when template is not available
   * This generates inline HTML for the recorder controls
   * @returns {string} Inline HTML content
   */
  _renderFallbackContent() {
    const data = this.getData();

    return `
      <div class="vox-chronicle-recorder">
        <div class="recorder-status ${data.statusClass}">
          <span class="status-indicator"></span>
          <span class="status-text">${escapeHtml(data.statusText)}</span>
        </div>

        <div class="recorder-duration">
          <span class="duration-label">${data.i18n.duration}:</span>
          <span class="duration-value">${data.duration}</span>
        </div>

        ${
          data.hasProgress
            ? `
          <div class="recorder-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${data.progress.progress}%"></div>
            </div>
            <span class="progress-text">${escapeHtml(data.progress.message)}</span>
          </div>
        `
            : ''
        }

        <div class="recorder-controls">
          ${
            data.canRecord
              ? `
            <button class="btn-record" data-action="start-recording" title="${data.i18n.startRecording}">
              <i class="fa-solid fa-microphone"></i> ${data.i18n.startRecording}
            </button>
          `
              : ''
          }

          ${
            data.canStop
              ? `
            <button class="btn-stop" data-action="stop-recording" title="${data.i18n.stopRecording}">
              <i class="fa-solid fa-stop"></i> ${data.i18n.stopRecording}
            </button>
          `
              : ''
          }

          ${
            data.canPause
              ? `
            <button class="btn-pause" data-action="pause-recording" title="${data.i18n.pauseRecording}">
              <i class="fa-solid fa-pause"></i>
            </button>
          `
              : ''
          }

          ${
            data.canResume
              ? `
            <button class="btn-resume" data-action="resume-recording" title="${data.i18n.resumeRecording}">
              <i class="fa-solid fa-play"></i>
            </button>
          `
              : ''
          }
        </div>

        ${
          !data.isConfigured
            ? `
          <div class="recorder-warning">
            <i class="fa-solid fa-exclamation-triangle"></i>
            <span>${data.i18n.notConfigured}</span>
            <button class="btn-settings" data-action="open-settings">
              <i class="fa-solid fa-cog"></i> ${data.i18n.settings}
            </button>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  /**
   * Override _renderInner to provide fallback content if template is missing
   * @param {object} data - Template data
   * @returns {Promise<jQuery>} Rendered inner content
   * @protected
   */
  async _renderInner(data) {
    try {
      return await super._renderInner(data);
    } catch {
      // Template not found, use inline fallback
      this._logger.warn('Template not found, using fallback HTML');
      const html = this._renderFallbackContent();
      return $(html);
    }
  }
}

// Export the class and enum
export { RecorderControls, RecorderUIState };
