import dagre from 'dagre';
import deepmerge from 'deepmerge';
import { CodeObjectType } from '@appland/models';

import Geometry from '../../helpers/geometry';
import { createSVGElement, findTraversableNodesAndEdges } from './util';
import ClusterGroup from './groups/clusterGroup';
import NodeGroup from './groups/nodeGroup';
import LabelGroup from './groups/labelGroup';
import EdgeGroup from './groups/edgeGroup';

const NODE_PADDING_HORIZONTAL = 15;
const NODE_PADDING_VERTICAL = 10;

const DEFAULT_OPTIONS = {
  animation: {
    enable: true,
    duration: 300,
  },
};

export default class Graph {
  constructor(element, options = {}) {
    this.element = element;
    this.options = deepmerge(DEFAULT_OPTIONS, options);

    this.outputGroup = createSVGElement('g', 'output');
    this.edgesGroup = createSVGElement('g', 'edgePaths');
    this.clustersGroup = createSVGElement('g', 'clusters');
    this.nodesGroup = createSVGElement('g', 'nodes');

    this.outputGroup.appendChild(this.clustersGroup);
    this.outputGroup.appendChild(this.edgesGroup);
    this.outputGroup.appendChild(this.nodesGroup);

    this.element.innerHTML = '';
    this.element.appendChild(this.outputGroup);

    this.graph = new dagre.graphlib.Graph({ compound: true })
      .setGraph({ rankdir: 'LR' })
      .setDefaultEdgeLabel(() => ({}));
  }

  setNodeFromCodeObject(codeObject, parentId = null) {
    let label = codeObject.prettyName;
    if (!label) return;

    if (codeObject.type === CodeObjectType.PACKAGE || codeObject.type === CodeObjectType.HTTP) {
      const numChildren = codeObject.childLeafs().length;

      label += ` (${numChildren})`;
    }

    const node = {
      codeObject,
      label,
      id: codeObject.id,
      class: codeObject.type,
      shape: codeObject.type,
    };
    this.setNode(node, parentId);
  }

  setNode(data, parentId = null) {
    const node = { ...data };
    if (this.graph.node(node.id)) {
      return;
    }

    if (node.type !== 'cluster') {
      // create dummy <g class="node"> with label to determine label width
      const dummyNodeGroup = createSVGElement('g', 'node');
      const labelGroup = new LabelGroup(
        node.label,
        ['http', 'package'].includes(node.class) ? 'expand' : false,
        true
      );
      dummyNodeGroup.appendChild(labelGroup.element);
      this.nodesGroup.appendChild(dummyNodeGroup);
      const labelBBox = labelGroup.getBBox();
      this.nodesGroup.removeChild(dummyNodeGroup);

      node.labelWidth = labelBBox.width;
      node.labelHeight = labelBBox.height;
      node.width = labelBBox.width + NODE_PADDING_HORIZONTAL * 2;
      node.height = labelBBox.height + NODE_PADDING_VERTICAL * 2;
    }

    this.graph.setNode(node.id, node);

    if (parentId) {
      this.graph.setParent(node.id, parentId);
    }
  }

  removeNode(id) {
    const edges = this.graph.nodeEdges(id);
    const node = this.graph.node(id);

    if (edges) {
      edges.forEach(({ v, w }) => {
        const edge = this.graph.edge(v, w);
        if (edge.group) {
          edge.group.remove();
        }
        this.graph.removeEdge(v, w);
      });
    }

    node.group.remove();
    this.graph.removeNode(id);
  }

  setEdge(codeObjectFrom, codeObjectTo) {
    const idFrom = codeObjectFrom.id;
    const idTo = codeObjectTo.id;

    if (codeObjectFrom === codeObjectTo || this.graph.edge(idFrom, idTo)) {
      return;
    }

    if (!this.graph.node(idTo) || this.graph.children(idTo).length) {
      return;
    }

    if (!this.graph.node(idFrom) || this.graph.children(idFrom).length) {
      return;
    }

    this.graph.setEdge(idFrom, idTo, {
      codeObjectTo,
      codeObjectFrom,
    });
  }

  render() {
    dagre.layout(this.graph);

    this.graph.nodes().forEach((id) => {
      const node = this.graph.node(id);

      if (node.group) {
        node.group.move(node.x, node.y);

        if (node.type === 'cluster') {
          node.group.resize(node.width, node.height);
        }

        return;
      }

      if (node.type === 'cluster') {
        const clusterGroup = new ClusterGroup(node);
        node.group = clusterGroup;
        node.element = clusterGroup.element;
        this.clustersGroup.appendChild(clusterGroup.element);
      } else {
        const nodeGroup = new NodeGroup(node, this.options.animation);

        node.group = nodeGroup;
        node.element = nodeGroup.element;

        this.nodesGroup.appendChild(nodeGroup.element);

        nodeGroup.show();
      }
    });

    this.graph.edges().forEach(({ v, w }) => {
      const edge = this.graph.edge(v, w);

      if (edge.group) {
        edge.group.move(edge.points);
      } else {
        const edgeGroup = new EdgeGroup(edge.points, this.options.animation);
        const fromNode = this.graph.node(v);
        const toNode = this.graph.node(w);

        edgeGroup.element.dataset.from = v;
        edgeGroup.element.dataset.fromType = fromNode.codeObject.type;

        edgeGroup.element.dataset.to = w;
        edgeGroup.element.dataset.toType = toNode.codeObject.type;

        edge.group = edgeGroup;
        edge.element = edgeGroup.element;

        this.edgesGroup.appendChild(edgeGroup.element);

        edgeGroup.show();
      }
    });

    this.element.setAttribute('width', this.graph.graph().width);
    this.element.setAttribute('height', this.graph.graph().height);
  }

  clearHighlights() {
    this.outputGroup.querySelectorAll('.highlight,.highlight--inbound').forEach((el) => {
      el.classList.remove('highlight');
      el.classList.remove('highlight--inbound');
    });
  }

  highlightNode(id) {
    const highlightedNode = this.graph.node(id);
    if (!highlightedNode) {
      return null;
    }

    const children = this.graph.children(id);
    if (highlightedNode.type === 'cluster') {
      children.forEach((childId) => this.highlightNode(childId));
    }

    if (highlightedNode.element.classList.contains('dim')) {
      return null;
    }

    highlightedNode.element.classList.add('highlight');

    this.graph.nodeEdges(id).forEach((e) => {
      const edge = this.graph.edge(e).element;
      edge.classList.add('highlight');

      if (id === e.w) {
        edge.classList.add('highlight--inbound');
      }

      // Render highlighted connections above non-highlighted connections
      if (!edge.classList.contains('dim')) {
        const parent = edge.parentNode;
        parent.removeChild(edge);
        parent.appendChild(edge);
      }
    });

    return highlightedNode.codeObject;
  }

  clearFocus() {
    this.outputGroup.querySelectorAll('.dim').forEach((el) => {
      el.classList.remove('dim');
    });
  }

  focus(id) {
    const [visitedNodes, visitedEdges] = findTraversableNodesAndEdges(this.graph, id);

    this.graph.nodes().forEach((nodeId) => {
      if (visitedNodes.has(nodeId)) {
        return;
      }

      const node = this.graph.node(nodeId);
      if (node.type !== 'cluster') {
        node.element.classList.add('dim');
      }
    });

    this.graph.edges().forEach((edgeId) => {
      if (visitedEdges.has(edgeId)) {
        return;
      }

      const edge = this.graph.edge(edgeId).element;
      edge.classList.add('dim');

      const parent = edge.parentNode;
      parent.removeChild(edge);
      parent.insertAdjacentElement('afterbegin', edge);
    });
  }

  expand(codeObject, children) {
    const { id } = codeObject;

    this.graph.edges().forEach(({ v, w }) => {
      if (v === id || w === id) {
        const edge = this.graph.edge(v, w);
        if (edge.group) {
          edge.group.remove();
          this.graph.removeEdge(v, w);
        }
      }
    });

    this.removeNode(id);

    const clusterNode = {
      id,
      type: 'cluster',
      label: codeObject.id,
      children: children.length,
      class: codeObject.type,
      codeObject,
    };

    this.setNode(clusterNode);
    children.forEach((obj) => this.setNodeFromCodeObject(obj, id));
  }

  collapse() {
    this.render();
  }

  getNodesBox(nodes) {
    const nodesBox = {
      top: [],
      left: [],
      right: [],
      bottom: [],
      x: [],
      y: [],
    };

    nodes.forEach((id) => {
      const node = this.graph.node(id);
      if (!node) {
        return;
      }

      const nodeBox = node.element.getBoundingClientRect() || node.element.getBBox();
      nodesBox.top.push(nodeBox.top);
      nodesBox.left.push(nodeBox.left);
      nodesBox.right.push(nodeBox.right);
      nodesBox.bottom.push(nodeBox.bottom);
      nodesBox.x.push(node.x - nodeBox.width / 2);
      nodesBox.y.push(node.y - nodeBox.height / 2);
    });

    nodesBox.top = Math.min(...nodesBox.top);
    nodesBox.left = Math.min(...nodesBox.left);
    nodesBox.right = Math.max(...nodesBox.right);
    nodesBox.bottom = Math.max(...nodesBox.bottom);
    nodesBox.offsetTop = Math.min(...nodesBox.y);
    nodesBox.offsetLeft = Math.min(...nodesBox.x);

    nodesBox.width = nodesBox.right - nodesBox.left;
    nodesBox.height = nodesBox.bottom - nodesBox.top;

    return nodesBox;
  }

  scrollToNodes(container, nodes) {
    const nodesBox = this.getNodesBox(nodes);
    const containerBox = container.getBoundingClientRect();

    if (Geometry.contains(containerBox, nodesBox)) {
      return false;
    }

    const xRatio = containerBox.width / nodesBox.width;
    const yRatio = containerBox.height / nodesBox.height;
    const scale = xRatio > 1 && yRatio > 1 ? 1 : Math.min(xRatio, yRatio) - 0.01;

    return {
      scale,
      x: nodesBox.width / 2 + nodesBox.offsetLeft,
      y: nodesBox.height / 2 + nodesBox.offsetTop,
    };
  }

  edge(to, from) {
    return this.graph.edge(to, from);
  }

  node(id) {
    return this.graph.node(id);
  }
}
