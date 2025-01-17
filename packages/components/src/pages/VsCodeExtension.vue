<template>
  <div
    id="app"
    ref="app"
    :key="renderKey"
    :class="classes"
    @mousemove="makeResizing"
    @mouseup="stopResizing"
    @mouseleave="stopResizing"
    data-cy="app"
  >
    <div class="loader"></div>
    <div :class="leftColumnClasses" ref="mainColumnLeft" @transitionend="detailsPanelTransitionEnd">
      <transition name="slide-in-from-left">
        <v-details-panel
          v-if="showDetailsPanel"
          class="slide-in-from-left"
          :appMap="filteredAppMap"
          :selected-object="selectedObject"
          :selected-label="selectedLabel"
          :filters-root-objects="filters.rootObjects"
          :findings="findings"
          :wasAutoPruned="wasAutoPruned"
          :isGiantAppMap="isGiantAppMap"
          :showAskNavie="showAskNavie"
          @onChangeFilter="
            (value) => {
              this.eventFilterText = value;
            }
          "
          @openStatsPanel="
            () => {
              this.showStatsPanel = true;
            }
          "
          @clearSelections="clearSelection"
          @hideDetailsPanel="hideDetailsPanel"
          @askNavieAboutMap="askNavie"
          data-cy="sidebar"
        />
      </transition>
      <div v-if="showDetailsPanel" class="main-column--drag" @mousedown="startResizing"></div>
      <div v-if="!showDetailsPanel" class="sidebar-menu" data-cy="sidebar-menu">
        <div data-cy="sidebar-hamburger-menu-icon" @click="revealDetailsPanel">
          <HamburgerMenu class="sidebar-menu__icon sidebar-menu__hamburger-menu" width="30" />
        </div>
        <div data-cy="collapsed-sidebar-ask-navie" @click="askNavie" v-if="showAskNavie">
          <VCompassIcon class="sidebar-menu__icon sidebar-menu__compass" width="37" />
        </div>
      </div>
    </div>

    <div class="main-column main-column--right" ref="mainColumnRight">
      <v-tabs
        @activateTab="onChangeTab"
        ref="tabs"
        :initial-tab="defaultView"
        :class="[isNarrow ? 'narrow' : '']"
      >
        <v-search-bar
          v-if="!isGiantAppMap"
          ref="searchBar"
          :nodesLength="eventFilterMatches.length"
          :suggestions="eventsSuggestions"
          :currentIndex="eventFilterMatchIndex"
          :initialSearchValue="eventFilterText"
          @onChange="
            (value) => {
              this.eventFilterText = value;
            }
          "
          @onPrevArrow="prevSearchBar"
          @onNextArrow="nextSearchBar"
          @clearSearchBar="() => (this.eventFilterMatchIndex = undefined)"
          @makeSelection="searchBarSelection"
        />
        <v-tab
          name="Dependency Map"
          :is-active="isViewingComponent"
          :tabName="VIEW_COMPONENT"
          :ref="VIEW_COMPONENT"
        >
          <v-loading-spinner v-if="isDiagramLoading" />
          <v-lazy-loader>
            <v-diagram-component
              :class-map="filteredAppMap.classMap"
              :highlighted-event-index="eventFilterMatchIndex"
            />
          </v-lazy-loader>
        </v-tab>

        <v-tab
          name="Sequence Diagram"
          :is-active="isViewingSequence"
          :ref="VIEW_SEQUENCE"
          :tabName="VIEW_SEQUENCE"
          :allow-scroll="true"
        >
          <v-loading-spinner v-if="isDiagramLoading" />
          <v-lazy-loader>
            <v-diagram-sequence
              ref="viewSequence_diagram"
              :app-map="filteredAppMap"
              :collapse-depth="seqDiagramCollapseDepth"
              :highlighted-event-index="eventFilterMatchIndex"
              @setMaxSeqDiagramCollapseDepth="setMaxSeqDiagramCollapseDepth"
              @updateCollapseDepth="handleNewCollapseDepth"
            />
          </v-lazy-loader>
        </v-tab>

        <v-tab name="Trace View" :is-active="isViewingFlow" :tabName="VIEW_FLOW" :ref="VIEW_FLOW">
          <div class="trace-view">
            <v-loading-spinner v-if="isDiagramLoading" />
            <v-lazy-loader>
              <v-diagram-trace
                ref="viewFlow_diagram"
                :events="filteredAppMap.rootEvents()"
                :event-filter-matches="new Set(eventFilterMatches)"
                :event-filter-match="eventFilterMatch"
                :event-filter-match-index="eventFilterMatchIndex + 1"
                :name="VIEW_FLOW"
                :zoom-controls="true"
                @clickEvent="onClickTraceEvent"
              />
            </v-lazy-loader>
          </div>
        </v-tab>

        <v-tab
          name="Flame Graph"
          :is-active="isViewingFlamegraph"
          :ref="VIEW_FLAMEGRAPH"
          :tabName="VIEW_FLAMEGRAPH"
          :allow-scroll="false"
        >
          <v-loading-spinner v-if="isDiagramLoading" />
          <v-lazy-loader>
            <v-diagram-flamegraph
              ref="viewFlamegraph_diagram"
              :events="filteredAppMap.rootEvents()"
              :title="filteredAppMap.name"
              :highlighted-event-index="eventFilterMatchIndex"
              @select="onFlamegraphSelect"
            />
          </v-lazy-loader>
        </v-tab>

        <template v-slot:notification>
          <v-notification
            v-if="version"
            :version="version"
            :body="versionText"
            @openEvent="onNotificationOpen"
            @closeEvent="onNotificationClose"
          />
        </template>
        <template v-slot:controls>
          <v-popper
            class="hover-text-popper"
            text="Ask Navie about this AppMap"
            placement="left"
            text-align="left"
            v-if="!sequenceDiagramDiffMode && showAskNavie"
          >
            <button class="ask-navie" @click="askNavie" data-cy="ask-navie-control-button">
              <v-compass-icon />
              <v-compass-icon class="ask-navie-glow" />
            </button>
          </v-popper>
          <v-popper
            class="hover-text-popper"
            text="Collapse actions below this depth"
            placement="left"
            text-align="left"
            v-if="isViewingSequence && !sequenceDiagramDiffMode"
          >
            <div class="depth-control">
              <button
                class="depth-button depth-button__decrease"
                @click="decreaseSeqDiagramCollapseDepth"
                data-cy="decrease-collapse-depth"
              >
                -
              </button>
              <div class="depth-text">
                {{ seqDiagramCollapseDepth }}
              </div>
              <button
                class="depth-button depth-button__increase"
                @click="increaseSeqDiagramCollapseDepth"
                data-cy="increase-collapse-depth"
              >
                +
              </button>
            </div>
          </v-popper>
          <v-popper-menu v-if="showDownload" position="bottom left" data-cy="export-button">
            <template v-slot:icon>
              <v-popper
                class="hover-text-popper"
                text="View export options"
                placement="left"
                text-align="left"
              >
                <ExportIcon class="control-button__icon" />
              </v-popper>
            </template>
            <template v-slot:body>
              <div class="export-options" data-cy="export-dropdown">
                <div class="export-options__header">Export as...</div>
                <div class="export-options__body">
                  <v-export-json :app-map="filteredAppMap" :view-state="viewState" ref="exportJSON">
                    <button
                      ref="exportJSON"
                      @click="$refs.exportJSON.download()"
                      data-cy="exportJSON"
                    >
                      JSON
                    </button>
                  </v-export-json>
                  <v-download-sequence-diagram ref="exportSVG" text="Export in SVG format">
                    <button @click="$refs.exportSVG.download()" data-cy="exportSVG">SVG</button>
                  </v-download-sequence-diagram>
                </div>
              </div>
            </template>
          </v-popper-menu>
          <v-popper
            v-else
            class="hover-text-popper"
            text="Export as JSON"
            placement="left"
            text-align="left"
            data-cy="export-button"
          >
            <v-export-json :app-map="filteredAppMap" :view-state="viewState" ref="exportJSON">
              <button
                class="control-button"
                href="#"
                ref="exportJSON"
                @click="$refs.exportJSON.download()"
                data-cy="exportJSON"
              >
                <ExportIcon class="control-button__icon" />
              </button>
            </v-export-json>
          </v-popper>
          <v-popper
            v-if="hasStats"
            class="hover-text-popper hide-small"
            text="Show statistics about this AppMap"
            placement="left"
            text-align="left"
            data-cy="stats-button"
          >
            <button class="control-button" @click="toggleStatsPanel" title="">
              <StatsIcon class="control-button__icon" />
            </button>
          </v-popper>
          <v-popper-menu
            v-if="!isPrecomputedSequenceDiagram && !isGiantAppMap"
            :isHighlight="filtersChanged"
            data-cy="filters-button"
            :class="[isNarrow ? 'narrow' : '']"
          >
            <template v-slot:icon>
              <v-popper
                class="hover-text-popper"
                text="Filter your view"
                placement="left"
                text-align="left"
              >
                <FilterIcon
                  class="control-button__icon"
                  data-cy="filter-button"
                  @click="openFilterModal"
                />
              </v-popper>
            </template>
            <template v-slot:body>
              <v-filter-menu
                :filteredAppMap="filteredAppMap"
                :isInBrowser="isInBrowser"
                @setState="(stateString) => setState(stateString)"
                class="filter"
              />
            </template>
          </v-popper-menu>
          <v-popper class="hover-text-popper" text="Reload map" placement="left" text-align="left">
            <button
              v-if="!isGiantAppMap"
              data-cy="reload-button"
              class="control-button diagram-reload"
              @click="resetDiagram"
              title="Clear"
            >
              <ReloadIcon class="control-button__icon" />
            </button>
          </v-popper>
          <v-popper
            class="hover-text-popper"
            text="Toggle fullscreen"
            placement="left"
            text-align="left"
            v-if="allowFullscreen"
          >
            <button
              data-cy="fullscreen-button"
              class="control-button"
              :data-enabled="isFullscreen"
              @click="toggleFullscreen"
            >
              <component :is="fullscreenIcon" class="control-button__stroke" />
            </button>
          </v-popper>
        </template>
      </v-tabs>

      <div v-if="showStatsPanel" class="appmap-stats">
        <v-stats-panel
          :stats="stats"
          :appMap="filteredAppMap"
          :pruneFilter="pruneFilter"
          @closeStatsPanel="closeStatsPanel"
        >
          <template v-slot:notification>
            <div
              v-if="isGiantAppMap"
              class="notification blocked"
              data-cy="giant-map-stats-notification"
            >
              <div class="content">
                <p class="notification-head">
                  <ExclamationIcon /><strong>This AppMap is too large to open.</strong>
                </p>
                <p>
                  To learn more about making your AppMaps smaller, please see our
                  <a href="https://appmap.io/docs/reference/handling-large-appmaps.html">
                    documentation
                  </a>
                  .
                </p>
              </div>
            </div>
            <div
              v-if="wasAutoPruned"
              class="notification trimmed"
              data-cy="pruned-map-stats-notification"
            >
              <div class="content">
                <p class="notification-head">
                  <ScissorsIcon /><strong>This AppMap has been automatically pruned.</strong>
                </p>
                <p>
                  This AppMap is too large, so we removed the highlighted functions below. Please
                  see our
                  <a href="https://appmap.io/docs/reference/handling-large-appmaps.html">
                    documentation
                  </a>
                  for more information on how to optimize your AppMaps.
                </p>
              </div>
            </div>
          </template>
        </v-stats-panel>
      </div>

      <div class="diagram-instructions hide-small" data-cy="instructions-button">
        <v-instructions ref="instructions" :currentView="currentView" />
      </div>
    </div>

    <v-no-data-notice v-if="isEmptyAppMap && !isLoading && !hasStats && isLicensed" />
    <v-configuration-required v-if="!isConfigured" />
    <v-unlicensed-notice v-if="!isLicensed" :purchase-url="purchaseUrl" />
  </div>
</template>

<script>
import {
  Event,
  serializeFilter,
  deserializeFilter,
  filterStringToFilterState,
  base64UrlEncode,
  AppMapFilter,
  AppMap,
} from '@appland/models';
import { unparseDiagram } from '@appland/sequence-diagram';

import AppMapLogo from '@/assets/appmap-logomark.svg';
import HamburgerMenu from '@/assets/hamburger-menu.svg';
import CopyIcon from '@/assets/copy-icon.svg';
import CloseIcon from '@/assets/close.svg';
import ReloadIcon from '@/assets/reload.svg';
import UploadIcon from '@/assets/link-icon.svg';
import ExportIcon from '@/assets/export.svg';
import FilterIcon from '@/assets/filter.svg';
import DiagramGray from '@/assets/diagram-empty.svg';
import StatsIcon from '@/assets/stats-icon.svg';
import ExclamationIcon from '@/assets/exclamation-circle.svg';
import ScissorsIcon from '@/assets/scissors-icon.svg';
import FullscreenEnterIcon from '@/assets/fullscreen.svg';
import FullscreenExitIcon from '@/assets/fullscreen-exit.svg';
import VDetailsPanel from '../components/DetailsPanel.vue';
import VDiagramComponent from '../components/DiagramComponent.vue';
import VDiagramSequence from '../components/DiagramSequence.vue';
import VDiagramFlamegraph from '../components/DiagramFlamegraph.vue';
import VDiagramTrace from '../components/DiagramTrace.vue';
import VDownloadSequenceDiagram from '../components/sequence/DownloadSequenceDiagram.vue';
import VExportJson from '../components/ExportJSON.vue';
import VFilterMenu from '../components/FilterMenu.vue';
import VInstructions from '../components/Instructions.vue';
import VNotification from '../components/Notification.vue';
import VPopperMenu from '../components/PopperMenu.vue';
import VPopper from '../components/Popper.vue';
import VStatsPanel from '../components/StatsPanel.vue';
import VTabs from '../components/Tabs.vue';
import VTab from '../components/Tab.vue';
import VNoDataNotice from '../components/notices/NoDataNotice.vue';
import VUnlicensedNotice from '../components/notices/UnlicensedNotice.vue';
import VConfigurationRequired from '../components/notices/ConfigurationRequiredNotice.vue';
import EmitLinkMixin from '@/components/mixins/emitLink';
import VSearchBar from '../components/SearchBar.vue';
import toListItem from '@/lib/finding';
import {
  store,
  SET_APPMAP_DATA,
  SET_VIEW,
  VIEW_COMPONENT,
  VIEW_SEQUENCE,
  VIEW_FLOW,
  VIEW_FLAMEGRAPH,
  SELECT_CODE_OBJECT,
  SELECT_LABEL,
  CLEAR_SELECTION_STACK,
  SET_EXPANDED_PACKAGES,
  CLEAR_EXPANDED_PACKAGES,
  SET_FILTER,
  SET_DECLUTTER_ON,
  RESET_FILTERS,
  ADD_ROOT_OBJECT,
  REMOVE_ROOT_OBJECT,
  SET_SAVED_FILTERS,
  SET_SELECTED_SAVED_FILTER,
  SET_HIGHLIGHTED_EVENTS,
  SET_FOCUSED_EVENT,
  SET_COLLAPSED_ACTION_STATE,
} from '../store/vsCode';
import isPrecomputedSequenceDiagram from '@/lib/isPrecomputedSequenceDiagram';
import { SAVED_FILTERS_STORAGE_ID } from '../components/FilterMenu.vue';
import { DEFAULT_SEQ_DIAGRAM_COLLAPSE_DEPTH } from '../components/DiagramSequence.vue';
import VCompassIcon from '@/assets/compass-simpler.svg';
import VLazyLoader from '@/components/LazyLoader.vue';
import VLoadingSpinner from '@/components/LoadingSpinner.vue';

const browserPrefixes = ['', 'webkit', 'moz'];

export default {
  name: 'VSCodeExtension',
  components: {
    AppMapLogo,
    HamburgerMenu,
    CloseIcon,
    CopyIcon,
    ReloadIcon,
    UploadIcon,
    ExportIcon,
    FilterIcon,
    VDetailsPanel,
    VDiagramComponent,
    VDiagramSequence,
    VDiagramTrace,
    VDiagramFlamegraph,
    VDownloadSequenceDiagram,
    VExportJson,
    VFilterMenu,
    VInstructions,
    VNotification,
    VPopperMenu,
    VPopper,
    VStatsPanel,
    VTabs,
    VTab,
    VSearchBar,
    DiagramGray,
    StatsIcon,
    ExclamationIcon,
    ScissorsIcon,
    FullscreenEnterIcon,
    FullscreenExitIcon,
    VNoDataNotice,
    VUnlicensedNotice,
    VConfigurationRequired,
    VCompassIcon,
    VLazyLoader,
    VLoadingSpinner,
  },
  store,
  data() {
    return {
      renderKey: 0,
      isLoading: true,
      isPanelResizing: false,
      initialPanelWidth: 0,
      initialClientX: 0,
      version: null,
      versionText: '',
      VIEW_COMPONENT,
      VIEW_SEQUENCE,
      VIEW_FLOW,
      VIEW_FLAMEGRAPH,
      eventFilterText: '',
      eventFilterMatchIndex: undefined,
      showStatsPanel: false,
      seqDiagramTimeoutId: undefined,
      seqDiagramCollapseDepth: DEFAULT_SEQ_DIAGRAM_COLLAPSE_DEPTH,
      maxSeqDiagramCollapseDepth: 9,
      sequenceDiagramDiffMode: false,
      isActive: true,
      isFullscreen: false,
      showDetailsPanel: false,
      rightColumnWidth: 0,
      filteredAppMap: this.emptyFilteredAppMap(),
      isDiagramLoading: false,
    };
  },
  mixins: [EmitLinkMixin],
  props: {
    defaultView: {
      type: String,
      default: VIEW_COMPONENT,
    },
    appMapUploadable: {
      type: Boolean,
      default: false,
    },
    savedFilters: {
      type: Array,
      default: () => [],
    },
    allowFullscreen: {
      type: Boolean,
      default: false,
    },
    isLicensed: {
      type: Boolean,
      default: true,
    },
    purchaseUrl: {
      type: String,
      required: false,
    },
    isConfigured: {
      type: Boolean,
      default: true,
    },
    allowExport: {
      type: Boolean,
      default: true,
    },
    autoExpandDetailsPanel: {
      type: Boolean,
      default: true,
    },
    appmapFsPath: {
      type: String,
      default: '',
    },
    showAskNavie: {
      type: Boolean,
      default: true,
    },
  },
  watch: {
    '$store.state.filters': {
      async handler(filters) {
        await this.applyFilters(filters, this.$store.state.appMap, true);
      },
      deep: true,
    },
    '$store.state.appMap': {
      handler(appMap) {
        this.applyFilters(this.filters, appMap);
      },
    },
    '$store.state.currentView': {
      handler(view) {
        this.$refs.tabs.activateTab(this.$refs[view]);
        this.$root.$emit('stateChanged', 'currentView');
      },
    },
    '$store.getters.selectedObject': {
      handler(selectedObject) {
        if (selectedObject) {
          if (selectedObject instanceof Event) {
            const highlightedIndex = this.eventFilterMatches.findIndex((e) => e === selectedObject);

            this.eventFilterMatchIndex = highlightedIndex >= 0 ? highlightedIndex : undefined;
          }

          if (selectedObject.type === 'analysis-finding')
            this.analysisFindingSelection(selectedObject);
        } else {
          this.eventFilterMatchIndex = undefined;
        }

        this.$root.$emit('stateChanged', 'selectedObject');
        if (this.autoExpandDetailsPanel) this.revealDetailsPanel();
      },
    },
    '$store.state.selectedLabel': {
      handler() {
        this.$root.$emit('stateChanged', 'selectedObject');
      },
    },
    '$store.state.focusedEvent': {
      handler(event) {
        if (event) {
          if (this.currentView === VIEW_COMPONENT) {
            let { defaultView } = this;
            if (this.isPrecomputedSequenceDiagram) defaultView = VIEW_SEQUENCE;

            this.setView(defaultView === VIEW_SEQUENCE ? VIEW_SEQUENCE : VIEW_FLOW);
          }
          this.$nextTick(() => {
            Object.keys(this.$refs)
              .filter((ref) => ref.endsWith('_diagram') && ref !== 'viewFlamegraph_diagram')
              .forEach((ref) => this.$refs[ref].showFocusEffect());
          });
        }
      },
    },
    highlightedNodes: {
      handler() {
        this.eventFilterMatchIndex = 0;
      },
    },
    eventFilterMatches: {
      handler(newVal) {
        this.$store.commit(SET_HIGHLIGHTED_EVENTS, newVal);
      },
    },
    filteredAppMap: {
      handler() {
        let selectedObjects = [];
        // TODO: Why are we doing this?
        //       We should standardize on `selectedObjects`.
        if (this.selectedObject) selectedObjects.push(this.selectedObject);
        if (this.selectedObjects) selectedObjects.push(...this.selectedObjects);

        this.$store.commit(CLEAR_SELECTION_STACK);

        selectedObjects.forEach(({ fqid }) => this.setSelectedObject(fqid));
      },
    },
    isActive: {
      handler() {
        clearTimeout(this.seqDiagramTimeoutId);
        if (this.isActive && this.isViewingSequence) {
          this.startSeqDiagramTimer();
        }
      },
    },
  },
  computed: {
    isPrecomputedSequenceDiagram,
    classes() {
      return this.isLoading ? 'app--loading' : '';
    },
    leftColumnClasses() {
      return {
        'main-column': true,
        'main-column--left': true,
        'manual-resizing': this.isPanelResizing,
      };
    },
    isInBrowser() {
      return window.location.protocol.includes('http');
    },
    pruneFilter() {
      const { appMap } = this.$store.state;
      const {
        data: { pruneFilter },
      } = appMap;
      return pruneFilter || {};
    },
    wasAutoPruned() {
      return this.pruneFilter.auto;
    },
    findings() {
      const { appMap } = this.$store.state;
      const {
        data: { findings },
      } = appMap;
      return this.uniqueFindings(findings);
    },
    stats() {
      const { appMap } = this.$store.state;
      const {
        data: { stats },
      } = appMap;
      return stats;
    },
    filters() {
      return this.$store.state.filters;
    },
    viewState() {
      return this.getStateObject();
    },
    rootObjectsSuggestions() {
      const filters = this.filters;
      return this.$store.state.appMap.classMap.codeObjects
        .map((co) => co.fqid)
        .filter((fqid) => !filters.rootObjects.includes(fqid));
    },
    hideNamesSuggestions() {
      const filters = this.filters;
      return this.filteredAppMap.classMap.codeObjects
        .map((co) => co.fqid)
        .filter((fqid) => !filters.declutter.hideName.names.includes(fqid));
    },
    eventsSuggestions() {
      const highlightedIds = new Set(this.eventFilterMatches.map((e) => e.id));
      const uniqueEventNames = new Set(
        this.filteredAppMap.events
          .filter((e) => e.isCall() && !highlightedIds.has(e.id))
          .map((e) => e.toString())
      );
      return Array.from(uniqueEventNames);
    },
    eventsById() {
      return this.filteredAppMap.events.reduce((map, e) => {
        map[e.id] = e.callEvent;
        return map;
      }, {});
    },
    eventsByLabel() {
      return this.filteredAppMap.events
        .filter((e) => e.isCall())
        .reduce((map, e) => {
          e.labels.forEach((label) => {
            map[label] = map[label] || [];
            map[label].push(e.callEvent);
          });
          return map;
        }, {});
    },
    eventFilterMatches() {
      const nodes = new Set();

      if (this.eventFilterText) {
        const queryTerms = this.eventFilterText.match(/(?:[^\s"]+|"[^"]*"|"[^"]*)+/g);

        if (queryTerms) {
          if (!this.eventFilterText.endsWith(' ')) {
            queryTerms.pop();
          }

          queryTerms.forEach((term) => {
            // search for event name
            if (/^".+"$/g.test(term)) {
              const eventName = term.slice(1, -1);

              this.filteredAppMap.events.forEach((e) => {
                if (e.isCall() && e.toString() === eventName) {
                  nodes.add(e);
                }
              });

              return;
            }

            const [query, text] = term.split(':');
            switch (query) {
              case 'id': {
                const eventId = parseInt(text, 10);
                if (Number.isNaN(eventId)) {
                  break;
                }

                const event = this.eventsById[eventId];
                if (event) {
                  nodes.add(event);
                } else if (this.filters.declutter.limitRootEvents.on) {
                  // when event is not present in filtered AppMap, but it's a root event - disable "Limit root events to HTTP" filter
                  const rootEvents = this.$store.state.appMap.rootEvents();
                  if (rootEvents.some((e) => e.id === eventId)) {
                    this.$nextTick(() => {
                      this.$store.commit(SET_DECLUTTER_ON, {
                        declutterProperty: 'limitRootEvents',
                        value: false,
                      });
                    });
                  }
                }

                break;
              }

              case 'label': {
                const events = this.eventsByLabel[text];

                if (events) {
                  events.forEach((e) => nodes.add(e));
                }

                break;
              }

              default: {
                // Perform a full text search using query
                if (term.length < 3) {
                  break;
                }
                this.filteredAppMap.events.forEach((e) => {
                  if (
                    e.isCall() &&
                    e.toString().toLowerCase().includes(term.toString().toLowerCase())
                  ) {
                    nodes.add(e);
                  }
                });
              }
            }
          });
        }
      }

      return Array.from(nodes).sort((a, b) => a.id - b.id);
    },
    eventFilterMatch() {
      return (
        Number.isFinite(this.eventFilterMatchIndex) &&
        this.eventFilterMatches[this.eventFilterMatchIndex]
      );
    },
    selectedObject() {
      return this.$store.getters.selectedObject;
    },
    selectionStack() {
      return this.$store.state.selectionStack;
    },
    selectedEvent() {
      return this.selectedObject instanceof Event ? [this.selectedObject] : [];
    },
    selectedLabel() {
      return this.$store.state.selectedLabel;
    },
    currentView() {
      return this.$store.state.currentView;
    },
    expandedPackages() {
      return this.$store.state.expandedPackages;
    },
    baseActors() {
      return this.$store.state.baseActors;
    },
    isViewingComponent() {
      return this.currentView === VIEW_COMPONENT;
    },
    isViewingSequence() {
      return this.currentView === VIEW_SEQUENCE;
    },
    isViewingFlow() {
      return this.currentView === VIEW_FLOW;
    },
    isViewingFlamegraph() {
      return this.currentView === VIEW_FLAMEGRAPH;
    },
    showDownload() {
      return this.isViewingSequence && !this.isGiantAppMap && this.allowExport;
    },
    isEmptyAppMap() {
      const appMap = this.filteredAppMap;
      const hasEvents = Array.isArray(appMap.events) && appMap.events.length;
      const hasClassMap =
        Array.isArray(appMap.classMap.codeObjects) && appMap.classMap.codeObjects.length;

      return !this.filtersChanged && !this.eventFilterText && (!hasEvents || !hasClassMap);
    },
    isGiantAppMap() {
      return this.isEmptyAppMap && this.hasStats;
    },
    filtersChanged() {
      return (
        this.filters.rootObjects.length > 0 ||
        Object.keys(this.filters.declutter).some((declutterPropertyName) => {
          // This might get set to a non-default value if the map does not have an HTTP root
          if (declutterPropertyName === 'limitRootEvents') return false;

          const declutterProperty = this.filters.declutter[declutterPropertyName];
          const on = declutterProperty.on;

          return (
            (typeof on === 'boolean' && on !== declutterProperty.default) ||
            (typeof on === 'function' && on() !== declutterProperty.default)
          );
        })
      );
    },
    hasStats() {
      return this.stats && this.stats.functions && this.stats.functions.length > 0;
    },
    fullscreenIcon() {
      return this.isFullscreen ? FullscreenExitIcon : FullscreenEnterIcon;
    },
    isNarrow() {
      return Number.isFinite(this.rightColumnWidth) && this.rightColumnWidth < 685;
    },
  },
  methods: {
    async applyFilters(filter, appMap, isAsync = false) {
      if (isAsync) {
        this.isDiagramLoading = true;
        await new Promise((resolve) => {
          setTimeout(() => {
            this.filteredAppMap = filter.filter(appMap, this.findings);
            this.isDiagramLoading = false;
            resolve();
          }, 0);
        });
      } else {
        this.filteredAppMap = filter.filter(appMap, this.findings);
      }
    },
    emptyFilteredAppMap() {
      return new AppMapFilter().filter(new AppMap());
    },
    detailsPanelTransitionEnd() {
      this.rightColumnWidth = this.$refs.mainColumnRight.offsetWidth;
    },
    loadData(appMap, sequenceDiagram) {
      if (sequenceDiagram) {
        this.sequenceDiagramDiffMode = true;
        appMap['sequenceDiagram'] = unparseDiagram(sequenceDiagram);
      }

      const viewState = appMap.viewState;
      delete appMap.viewState;

      this.$store.commit(SET_APPMAP_DATA, appMap);

      const applyViewState = () => {
        this.setState(viewState);
      };

      const applySavedFilters = () => {
        this.initializeSavedFilters();

        const rootEvents = this.$store.state.appMap.rootEvents();
        const hasHttpRoot = rootEvents.some((e) => e.httpServerRequest);
        const isUsingAppMapDefault = this.$store.state.savedFilters.some(
          (savedFilter) => savedFilter.filterName === 'AppMap default' && savedFilter.default
        );

        if (isUsingAppMapDefault && !hasHttpRoot) {
          this.$store.commit(SET_DECLUTTER_ON, {
            declutterProperty: 'limitRootEvents',
            value: hasHttpRoot,
          });
        }
      };

      if (viewState) {
        applyViewState();
      } else {
        applySavedFilters();
      }

      this.isLoading = false;

      // Return a promise that resolves next tick.
      // This allows the caller to wait for computed properties and watchers to run.
      return this.$nextTick();
    },
    showInstructions() {
      this.$refs.instructions.open();
      this.$root.$emit('showInstructions');
    },
    showVersionNotification(version, versionText = '') {
      this.version = version;
      this.versionText = versionText;
    },
    onNotificationOpen() {
      this.$root.$emit('notificationOpen');
    },
    onNotificationClose() {
      this.version = null;
      this.versionText = '';
      this.$root.$emit('notificationClose');
    },
    onChangeTab(tab) {
      // 'tab' can be the tab name or the actual tab.
      let index = Object.values(this.$refs).findIndex((ref) => ref === tab);
      if (index === -1) index = Object.keys(this.$refs).findIndex((ref) => ref === tab);
      if (index === -1) {
        // There's no ref set up for this tab
        return;
      }

      const viewKey = Object.keys(this.$refs)[index];
      this.setView(viewKey);
      this.$root.$emit('changeTab', viewKey);

      if (viewKey === VIEW_SEQUENCE) {
        this.startSeqDiagramTimer();
      } else {
        clearTimeout(this.seqDiagramTimeoutId);
      }
    },
    startSeqDiagramTimer() {
      // prompt for feedback after viewing a sequence diagram for 1 minute
      this.seqDiagramTimeoutId = setTimeout(() => {
        this.$root.$emit('seq-diagram-feedback');
      }, 60 * 1000);
    },
    setView(view) {
      if (this.currentView !== view) {
        this.$store.commit(SET_VIEW, view);
      }
    },
    codeObjectToIdentifier(codeObject) {
      if (!codeObject) return '';

      if (codeObject.fqid) {
        return codeObject.fqid;
      } else if (codeObject.type === 'analysis-finding') {
        return `analysis-finding:${codeObject.resolvedFinding?.finding?.hash_v2}`;
      }
    },
    getStateObject() {
      const state = {};

      state.currentView = this.currentView;
      if (this.expandedPackages.length > 0)
        state.expandedPackages = this.expandedPackages.map((expandedPackage) => expandedPackage.id);

      if (this.selectionStack.length > 1) {
        state.selectedObjects = this.selectionStack.map(this.codeObjectToIdentifier.bind(this));
      } else if (this.selectionStack.length === 1) {
        state.selectedObject = this.codeObjectToIdentifier(this.selectedObject);
      } else if (this.selectedLabel) {
        state.selectedObject = `label:${this.selectedLabel}`;
      }

      if (this.eventFilterText) {
        state.traceFilter = this.eventFilterText;
      }

      state.filters = serializeFilter(this.filters);

      if (Object.keys(state.filters).length === 0) {
        delete state.filters;
      }

      return state;
    },
    getState() {
      const state = this.getStateObject();

      if (Object.keys(state).length === 0) {
        return '';
      }

      return base64UrlEncode(JSON.stringify(state));
    },
    openFilterModal() {
      this.$root.$emit('clickFilterButton');
    },
    setSelectedObject(fqid) {
      const matchResult = fqid.match(/^([a-z\-]+):(.+)/);

      if (!matchResult) {
        return;
      }

      const [, type, object] = matchResult;

      if (type === 'label') {
        this.$store.commit(SELECT_LABEL, object);
        return;
      }

      const { classMap, events } = this.filteredAppMap;
      let selectedObject = null;

      if (type === 'event') {
        const eventId = parseInt(object, 10);

        if (Number.isNaN(eventId)) {
          return;
        }

        selectedObject = events.find((e) => e.id === eventId);
      } else {
        selectedObject = classMap.codeObjects.find((obj) => obj.fqid === fqid);
      }

      if (selectedObject) this.$store.commit(SELECT_CODE_OBJECT, selectedObject);
      else console.warn(`Unable to find object with fqid ${fqid}`);
    },
    selectObjectFromState(fqid) {
      const [match, type, object] = fqid.match(/^([a-z\-]+):(.+)/);
      if (!match) return;

      if (type === 'label') {
        this.$store.commit(SELECT_LABEL, object);
        return;
      }

      const { classMap, events } = this.filteredAppMap;
      let selectedObject = null;

      if (type === 'event') {
        const eventId = parseInt(object, 10);

        if (Number.isNaN(eventId)) return;

        selectedObject = events.find((e) => e.id === eventId);

        // It's possible that we're trying to select an object that does not exist in the filtered
        // set. If we're unable to find an object, we'll look for it in the unfiltered set.
        if (!selectedObject) {
          selectedObject = this.$store.state.appMap.events.find((e) => e.id === eventId);

          if (selectedObject) {
            Object.keys(this.filters.declutter).forEach((declutterProperty) => {
              this.$store.commit(SET_DECLUTTER_ON, { declutterProperty, value: false });
            });
          }
        }
      } else if (type === 'analysis-finding') {
        const hash_v2 = object;
        const finding = this.findings.find(({ finding }) => finding.hash_v2 === hash_v2);
        if (finding) selectedObject = toListItem(finding);
      } else {
        selectedObject = classMap.codeObjects.find((obj) => obj.fqid === fqid);
      }

      if (selectedObject) this.$store.commit(SELECT_CODE_OBJECT, selectedObject);
      else console.warn(`Unable to find object with fqid ${fqid}`);
    },
    setState(serializedState) {
      return new Promise((resolve) => {
        if (!serializedState) {
          resolve();
          return;
        }

        const state =
          typeof serializedState === 'string'
            ? filterStringToFilterState(serializedState)
            : serializedState;
        if (state.selectedObject) this.selectObjectFromState(state.selectedObject);

        if (state.selectedObjects)
          state.selectedObjects.forEach((obj) => this.selectObjectFromState(obj));

        const { filters, expandedPackages } = state;
        if (filters) this.$store.commit(SET_FILTER, deserializeFilter(filters));

        const base64EncodedFilters = base64UrlEncode(JSON.stringify({ filters }));
        const selectedFilter =
          this.$store.state.savedFilters &&
          this.$store.state.savedFilters.find(
            (savedFilter) => savedFilter.state === base64EncodedFilters
          );
        if (selectedFilter) this.$store.commit(SET_SELECTED_SAVED_FILTER, selectedFilter);

        if (expandedPackages) {
          const codeObjects = expandedPackages.map((expandedPackageId) =>
            this.filteredAppMap.classMap.codeObjectFromId(expandedPackageId)
          );
          this.$store.commit(SET_EXPANDED_PACKAGES, codeObjects);
        }

        this.$nextTick(() => {
          if (state.currentView) {
            this.setView(state.currentView);
          }

          // traceFilter is supported for backwards compatibility
          let searchBarValue = state.searchBar || state.traceFilter;
          if (searchBarValue) {
            this.$nextTick(() => {
              if (!searchBarValue.endsWith(' ')) {
                searchBarValue += ' ';
              }

              this.$refs.searchBar.setValue(searchBarValue);
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    },
    clearSelection() {
      this.eventFilterMatchIndex = undefined;
      this.$store.commit(CLEAR_SELECTION_STACK);
      this.$root.$emit('clearSelection');
    },
    resetDiagram() {
      this.$store.commit(SET_COLLAPSED_ACTION_STATE, []);
      this.seqDiagramCollapseDepth =
        DEFAULT_SEQ_DIAGRAM_COLLAPSE_DEPTH > this.maxSeqDiagramCollapseDepth
          ? this.maxSeqDiagramCollapseDepth
          : DEFAULT_SEQ_DIAGRAM_COLLAPSE_DEPTH;
      this.$store.commit(CLEAR_EXPANDED_PACKAGES);
      this.clearSelection();
      this.$store.commit(RESET_FILTERS);
      this.$root.$emit('resetDiagram');

      this.renderKey += 1;
      this.eventFilterText = '';
      this.resetDetailsPanel();
    },
    toggleStatsPanel() {
      this.showStatsPanel = !this.showStatsPanel;
    },
    closeStatsPanel() {
      this.showStatsPanel = false;
    },
    hideDetailsPanel() {
      this.showDetailsPanel = false;
      this.autoResizeLeftPanel();
    },
    revealDetailsPanel() {
      this.showDetailsPanel = true;
      this.autoResizeLeftPanel();
    },
    resetDetailsPanel() {
      const width = this.$refs.app.offsetWidth;
      this.showDetailsPanel = width > 900;
      this.autoResizeLeftPanel();
    },
    uniqueFindings(findings) {
      if (!findings) return undefined;

      return Object.values(
        findings.reduce((unique, finding) => {
          unique[finding.finding.hash_v2] = finding;
          return unique;
        }, {})
      );
    },
    onFlamegraphSelect(event) {
      if (event) {
        this.onClickTraceEvent(event);
      } else {
        this.clearSelection();
      }
    },
    onClickTraceEvent(e) {
      this.$store.commit(SELECT_CODE_OBJECT, e);
    },
    startResizing(event) {
      document.body.style.userSelect = 'none';
      this.isPanelResizing = true;
      this.initialPanelWidth = this.$refs.mainColumnLeft.offsetWidth;
      this.initialClientX = event.clientX;
    },
    makeResizing(event) {
      if (this.isPanelResizing) {
        const MIN_PANEL_WIDTH = 280;
        const MAX_PANEL_WIDTH = window.innerWidth * 0.75;

        let newWidth = this.initialPanelWidth + (event.clientX - this.initialClientX);
        newWidth = Math.max(MIN_PANEL_WIDTH, newWidth);
        newWidth = Math.min(MAX_PANEL_WIDTH, newWidth);

        this.$refs.mainColumnLeft.style.width = `${newWidth}px`;
      }
    },
    stopResizing() {
      this.rightColumnWidth = this.$refs.mainColumnRight.offsetWidth;
      document.body.style.userSelect = '';
      this.isPanelResizing = false;
    },
    autoResizeLeftPanel() {
      this.$nextTick(() => {
        let result = '50px';

        const width = this.$refs.app.offsetWidth;
        if (width < 600 && this.showDetailsPanel) {
          result = `${width}px`;
        } else if (this.showDetailsPanel) {
          result = '420px';
        }
        this.$refs.mainColumnLeft.style.width = result;
      });
    },
    prevSearchBar() {
      if (this.eventFilterMatches.length === 0) {
        return;
      }

      if (Number.isFinite(this.eventFilterMatchIndex)) {
        this.eventFilterMatchIndex -= 1;
      } else {
        const [selectedEvent] = this.selectedEvent;
        if (selectedEvent) {
          const previousEvent = this.eventFilterMatches
            .filter((e) => e.id < selectedEvent.id)
            .pop();
          this.eventFilterMatchIndex = this.eventFilterMatches.findIndex(
            (e) => e === previousEvent
          );
        } else {
          this.eventFilterMatchIndex = undefined;
        }
      }

      if (this.eventFilterMatchIndex < 0) {
        this.eventFilterMatchIndex = this.eventFilterMatches.length - 1;
      }
    },
    nextSearchBar() {
      if (this.eventFilterMatches.length === 0) {
        return;
      }

      this.$store.commit(SET_FOCUSED_EVENT, null);

      if (Number.isFinite(this.eventFilterMatchIndex)) {
        this.eventFilterMatchIndex += 1;
      } else {
        const [selectedEvent] = this.selectedEvent;
        if (selectedEvent) {
          const previousEvent = this.eventFilterMatches
            .filter((e) => e.id > selectedEvent.id)
            .shift();
          this.eventFilterMatchIndex = this.eventFilterMatches.findIndex(
            (e) => e === previousEvent
          );
        } else {
          this.eventFilterMatchIndex = 0;
        }
      }

      if (
        this.eventFilterMatchIndex >= this.eventFilterMatches.length ||
        this.eventFilterMatchIndex < 0
      ) {
        this.eventFilterMatchIndex = 0;
      }
    },
    searchBarSelection() {
      this.eventFilterMatchIndex = 0;
    },
    initializeSavedFilters() {
      let savedFilters = this.savedFilters;

      if (this.isInBrowser && (!savedFilters || savedFilters.length === 0)) {
        const savedFiltersJson = localStorage.getItem(SAVED_FILTERS_STORAGE_ID);
        if (savedFiltersJson) {
          try {
            const loadedFilters = JSON.parse(savedFiltersJson);
            if (loadedFilters.length > 0) savedFilters = loadedFilters;
          } catch (e) {
            // do nothing
          }
        }
      }

      if (savedFilters.length === 0) {
        const defaultFilter = new AppMapFilter();
        const serialized = serializeFilter(defaultFilter);
        const base64encoded = base64UrlEncode(JSON.stringify({ filters: serialized }));

        const filterObject = {
          filterName: 'AppMap default',
          state: base64encoded,
          default: true,
        };

        this.$root.$emit('saveFilter', filterObject);
        savedFilters.push(filterObject);
      }

      if (this.isInBrowser)
        localStorage.setItem(SAVED_FILTERS_STORAGE_ID, JSON.stringify(savedFilters));

      this.$store.commit(SET_SAVED_FILTERS, savedFilters);

      const defaultFilter = savedFilters.find((savedFilter) => savedFilter.default);
      if (defaultFilter) {
        this.$store.commit(SET_SELECTED_SAVED_FILTER, defaultFilter);
        this.setState(defaultFilter.state);
      }
    },
    updateFilters(updatedFilters) {
      this.$store.commit(SET_SAVED_FILTERS, updatedFilters);
    },
    analysisFindingSelection(findingObject) {
      const finding = findingObject.resolvedFinding && findingObject.resolvedFinding.finding;
      if (!finding) return;

      if (finding.relatedEvents) {
        const relatedEvents = finding.relatedEvents
          .sort((a, b) => a.id - b.id)
          .map((event) => this.filteredAppMap.eventsById[event.id]);
        this.$refs.searchBar.setValue(
          relatedEvents.map((event) => `id:${event.id}`).join(' ') + ' '
        );
      }

      if (finding.impactDomain === 'Performance') {
        this.$store.commit(SET_VIEW, VIEW_FLAMEGRAPH);
      } else {
        this.$store.commit(SET_VIEW, VIEW_SEQUENCE);
      }

      const eventToFocus = finding.participatingEvents?.commonAncestor || finding.event;
      if (!eventToFocus) return;

      const event = this.filteredAppMap.eventsById[eventToFocus.id];
      this.$store.commit(SET_FOCUSED_EVENT, event);
    },
    increaseSeqDiagramCollapseDepth() {
      if (this.seqDiagramCollapseDepth < this.maxSeqDiagramCollapseDepth)
        this.seqDiagramCollapseDepth++;
    },
    decreaseSeqDiagramCollapseDepth() {
      if (this.seqDiagramCollapseDepth > 0) this.seqDiagramCollapseDepth--;
    },
    setMaxSeqDiagramCollapseDepth(maxDepth) {
      if (!maxDepth) return;
      if (maxDepth < this.seqDiagramCollapseDepth) this.seqDiagramCollapseDepth = maxDepth;
      this.maxSeqDiagramCollapseDepth = maxDepth;
    },
    handleNewCollapseDepth(newDepth) {
      this.seqDiagramCollapseDepth = newDepth;
    },
    async enterFullscreen() {
      const requestMethod =
        this.$el.requestFullScreen ||
        this.$el.webkitRequestFullScreen ||
        this.$el.mozRequestFullScreen ||
        this.$el.msRequestFullScreen;
      if (requestMethod) {
        try {
          await requestMethod.call(this.$el);
        } catch (e) {
          console.warn(e);
        }
      }
    },
    async exitFullscreen() {
      const requestMethod =
        document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
      if (requestMethod) {
        try {
          await requestMethod.call(document);
        } catch (e) {
          console.warn(e);
        }
      }
    },
    toggleFullscreen() {
      if (this.isFullscreen) {
        this.exitFullscreen();
      } else {
        this.enterFullscreen();
      }
    },
    checkFullscreen() {
      const fullscreenElement =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement;
      this.isFullscreen = fullscreenElement === this.$el;
    },
    askNavie() {
      this.$root.$emit('ask-navie-about-map', this.appmapFsPath);
    },
  },
  mounted() {
    this.$root.$on('makeRoot', (codeObject) => {
      this.$store.commit(ADD_ROOT_OBJECT, codeObject.fqid);
    });
    this.$root.$on('removeRoot', (fqid) => {
      this.$store.commit(REMOVE_ROOT_OBJECT, this.filters.rootObjects.indexOf(fqid));
    });
    this.resetDetailsPanel();
    browserPrefixes.forEach((prefix) => {
      this.$el.addEventListener(prefix + 'fullscreenchange', this.checkFullscreen);
    });
    this.rightColumnWidth = this.$refs.mainColumnRight.offsetWidth;
    if (!this.autoExpandDetailsPanel) this.hideDetailsPanel();
  },
  beforeUpdate() {
    if (this.isGiantAppMap) {
      this.showStatsPanel = true;
      this.setView(null);
    } else if (this.showStatsPanel && this.currentView === null) {
      this.showStatsPanel = false;
      this.setView(this.defaultView);
    }
  },
  beforeDestroy() {
    browserPrefixes.forEach((prefix) => {
      document.removeEventListener(prefix + 'fullscreenchange', this.checkFullscreen);
    });
  },
};
</script>

<style lang="scss">
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
}

body.sb-show-main.sb-main-padded {
  padding: 0;
}

* {
  box-sizing: border-box;
}

code {
  color: $teal;
}

.hide-small {
  @media (max-width: 900px) {
    display: none !important;
  }
}

.appmap-stats {
  height: 95%;
  overflow-y: auto;
  overflow: scroll;
  padding: 0;
}

.share-appmap,
.appmap-stats {
  box-shadow: $box-shadow-min;
  font-family: $appland-text-font-family;
  position: absolute;
  top: 5rem;
  right: 2rem;
  background-color: $gray2;
  border-radius: 0.5rem;
  width: calc(100% - 4rem);
  word-break: break-word;
  z-index: 2;
  h1 {
    color: $white;
    font-weight: 800;
  }
  h3 {
    margin-bottom: 0.5rem;
  }
  .heading {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    border-bottom: 1px solid #808b9869;
    svg {
      margin-right: 0.5rem;
    }
  }
  .content {
    padding: 0 2rem;
    color: $white;
    line-height: 1.5rem;
  }
  .share-url {
    p {
      margin-top: 0.5rem;
      margin-bottom: 0;
    }
  }
  .share-link {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    background-color: $white;
    padding: 0.6rem 1.25rem;
    border-radius: 0.5rem;
    .url {
      color: $blue;
      font-weight: 800;
      transition: $transition;
      &:hover {
        color: $royal;
        cursor: pointer;
      }
    }
    .icon {
      &:hover {
        cursor: pointer;
      }
      color: $blue;
    }
  }
  .close-me {
    transition: $transition;
    font-weight: 800;
    width: 16px;
    height: 16px;
    fill: white;
    &:hover {
      fill: $blue;
      cursor: pointer;
    }
  }
}

.appmap-stats {
  background-color: transparent;
  .notification {
    padding: 1rem;
    border-radius: 0.5rem;
    display: grid;
    grid-template-columns: auto;
    gap: 0.5rem;
    align-items: baseline;
    margin: 0 1rem 1rem 1rem;
    box-shadow: $box-shadow-min;
    .content {
      margin: 0;
      padding: 0;
    }
    .notification-head {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    svg {
      width: 1rem;
      height: 1rem;
      fill: $white;
    }
    a {
      color: inherit;
    }
    p {
      margin: 0;
    }
    &.blocked {
      background-color: #d1245c;
    }
    &.trimmed {
      background: #c07d1b;
    }
  }
}

#app {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 100%;
  height: 100vh;
  color: $base11;
  background-color: $black;

  &.app--loading {
    .loader {
      display: block;
    }
    .main-column {
      opacity: 0;
      pointer-events: none;
    }
  }

  .loader {
    display: none;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 80px;
    height: 80px;

    &:after {
      content: '';
      display: block;
      width: 64px;
      height: 64px;
      margin: 8px;
      border-radius: 50%;
      border: 6px solid transparent;
      border-color: $hotpink transparent $hotpink transparent;
      animation: loader-animation 1.2s linear infinite;
    }
  }

  .export-options {
    padding: 0.5rem 1rem;
    background-color: $gray2;
    border-radius: $border-radius;
    border: 1px solid $gray3;

    &__header {
      padding-bottom: 0.2rem;
      margin-bottom: 0.7rem;
      border-bottom: 1px solid lighten($gray3, 15%);
    }

    &__body {
      display: flex;
      margin-bottom: 0.2rem;

      button {
        background: $light-purple;
        color: $gray5;
        text-decoration: none;
        font-weight: 700;
        font-family: $appland-text-font-family;
        font-size: 0.75rem;
        transition: $transition;
        border-radius: 5px;
        border: 0px;
        margin: 5px;
        padding: 10px;

        &:hover {
          background: $dark-purple;
          cursor: pointer;
        }
      }
    }
  }

  .main-column {
    &--left--hidden {
      display: none;
    }

    &--left {
      position: relative;
      grid-column: 1;
      width: 420px;
      transition: width 0.5s ease-in-out;

      .slide-in-from-left {
        animation: slide-in-from-left 0.5s ease-out forwards;
      }

      .sidebar-menu {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: 0.5rem;
        border-right: 1px solid $gray2;
        height: 100%;

        &__icon {
          margin: 0.6rem auto;
        }

        &__hamburger-menu {
          &:hover {
            cursor: pointer;
            stroke: $blue;

            circle,
            path {
              stroke: $blue;
              transition: $transition;
            }
          }
        }

        &__compass {
          circle {
            stroke: darken($gray5, 10%);
            transition: $transition;
          }

          path {
            fill: darken($gray5, 10%);
            transition: $transition;
          }

          &:hover {
            cursor: pointer;

            circle {
              stroke: $hotpink;
              transition: $transition;
            }

            path {
              fill: $hotpink;
              transition: $transition;
            }
          }
        }
      }
    }

    &--left.manual-resizing {
      transition: none !important;
    }

    &--right {
      position: relative;
      grid-column-start: 2;
      grid-column-end: 3;
      width: 100%;
      min-width: 400px;
      word-break: break-all;
      overflow: hidden;

      .control-button {
        border: none;
        display: inline-flex;
        align-items: center;
        padding: 0.25rem;
        background: transparent;
        color: $lightgray2;
        font: inherit;
        font-family: $appland-text-font-family;
        font-size: 0.75rem;
        outline: none;
        appearance: none;
        cursor: pointer;
        transition: color 0.3s ease-in;

        &:hover,
        &:active {
          color: $gray5;
          transition-timing-function: ease-out;
        }

        &__stroke {
          width: 16px;
          height: 14px;
          stroke-width: 4;
          stroke: $lightgray2;
          fill: none;

          path {
            stroke: $lightgray2;
          }

          &:hover {
            path {
              stroke: $gray5;
            }
          }
        }

        &__icon {
          width: 16px;
          height: 14px;
          fill: currentColor;
        }
      }

      .download-button {
        display: inline-block;
      }

      .diagram-instructions {
        position: absolute;
        right: 1.3rem;
        bottom: 1.3rem;
      }

      .hover-text-popper {
        display: inline-block;
      }

      .depth-text {
        width: 16px;
        padding: 0px 0px;

        text-align: center;
        display: inline;

        font-weight: 700;
        font-family: $appland-text-font-family;
        font-size: 0.9rem;
        cursor: pointer;
      }

      $glow-size: 4px;
      @keyframes glow {
        0%,
        100% {
          opacity: 0;
        }

        50% {
          opacity: 0.75;
        }
      }
      .ask-navie {
        position: relative;
        background-color: inherit;
        border: none;
        padding: 0;

        &:hover {
          cursor: pointer;
          filter: drop-shadow(0 0 $glow-size $white) !important;

          svg path {
            fill: $white;
          }

          svg circle {
            stroke: $white;
          }
        }

        svg {
          width: 22px;

          path {
            fill: $gray4;
          }

          circle {
            stroke: $gray4;
          }
        }
      }

      .ask-navie-glow {
        position: absolute;
        z-index: 1;
        top: 0;
        left: 0;
        animation: glow 5s infinite cubic-bezier(0.25, 0.46, 0.45, 0.94);
        pointer-events: none;
        transform: translateZ(0);
        will-change: opacity;

        path {
          fill: rgb(255, 7, 170) !important;
        }
        circle {
          stroke: rgb(255, 7, 170) !important;
        }
      }

      .depth-button {
        width: 18px;
        padding: 0px 0px;
        aspect-ratio: 1/1;

        border: none;
        background-color: $lightgray2;
        font-weight: 700;
        font-family: $appland-text-font-family;
        font-size: 1rem;
        outline: none;
        appearance: none;
        cursor: pointer;
        transition: color 0.3s ease-in;

        &:hover {
          color: $gray5;
          transition-timing-function: ease-out;
        }

        &__increase {
          left: 16px;
        }

        &__decrease {
          left: -18px;
        }
      }

      .depth-control {
        position: relative;
        border-width: 2px;
        border-radius: 7px;
        border-color: $lightgray2;
        border-style: solid;
        padding: 0%;
        display: inline-flex;
        align-items: center;
        background: transparent;
        color: $lightgray2;
        font: inherit;
        font-family: $appland-text-font-family;
        font-size: 0.75rem;
        outline: none;
        appearance: none;
        transition: color 0.3s ease-in;

        &:hover {
          color: $gray5;
          transition-timing-function: ease-out;
        }
      }
    }

    .main-column--drag {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 1px;
      background: transparent;
      cursor: col-resize;
      z-index: 100;

      &:hover {
        background: $gray5;
      }

      &::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: -8px;
        bottom: 0;
        background-position: 4px 49%;
        background-repeat: no-repeat;
        background-image: url("data:image/svg+xml,%3Csvg width='2' height='14' viewBox='0 0 2 14' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23808b98' fill-rule='evenodd'%3E%3Ccircle cx='1' cy='1' r='1'/%3E%3Ccircle cx='1' cy='5' r='1'/%3E%3Ccircle cx='1' cy='9' r='1'/%3E%3Ccircle cx='1' cy='13' r='1'/%3E%3C/g%3E%3C/svg%3E");
        touch-action: none;
      }
    }
  }

  .trace-view {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
}

@keyframes loader-animation {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes slide-in-from-left {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(0);
  }
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-button {
  width: 0px;
  height: 0px;
}
::-webkit-scrollbar-thumb {
  background: $gray4;
  border: 0;
  border-radius: 50px;
}
::-webkit-scrollbar-thumb:hover,
::-webkit-scrollbar-thumb:active {
  background: $gray5;
}
::-webkit-scrollbar-track {
  background: $black;
  border: 0;
  border-radius: 50px;
}
::-webkit-scrollbar-corner {
  background: transparent;
}

@media (max-width: 1250px) {
  #app .main-column--right .hover-text-popper {
    background-color: transparent;
    padding: 0;
    span {
      display: none;
    }
  }
}
</style>
