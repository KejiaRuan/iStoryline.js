const storyJson = require('../data/case/case1.json') // storyJson
const iStoryline = require('../build/js/index')

// constructing sub json data
function constructSubStoryJson(storyJson, startFrame, endFrame) {
  const _charactersJson = {}
  const _locationJson = {}
  const charactersJson = storyJson['Story']['Characters']
  for (const charName in charactersJson) {
    const charItemList = charactersJson[charName]
    charItemList.forEach(charItem => {
      const sFrame = charItem.Start
      const eFrame = charItem.End
      const loc = charItem.Session
      if (startFrame <= sFrame && eFrame <= endFrame) {
        if (charName in _charactersJson) {
          _charactersJson[charName].push(charItem)
        } else {
          _charactersJson[charName] = [charItem]
        }
        _locationJson[`LOC${loc}`] = [loc]
      }
    })
  }
  return {
    Story: {
      Locations: _locationJson,
      Characters: _charactersJson,
    },
  }
}

function countCrossings(table) {
  let count = 0
  for (let frame = 1; frame < table.cols; frame++) {
    const left = frame - 1
    const right = frame
    for (let i = 0; i < table.rows; i++) {
      for (let j = i + 1; j < table.rows; j++) {
        if (
          table.value(i, left) *
            table.value(j, left) *
            table.value(i, right) *
            table.value(j, right) >
          0
        ) {
          if (
            (table.value(i, left) - table.value(j, left)) *
              (table.value(i, right) - table.value(j, right)) <
            0
          ) {
            count++
          }
        }
      }
    }
  }
  return count
}

function countWiggles(table) {
  let wiggles = 0
  for (let char = 0; char < table.rows; char++) {
    for (let frame = 0; frame < table.cols - 1; frame++) {
      if (table.value(char, frame) * table.value(char, frame + 1) > 0) {
        if (table.value(char, frame) !== table.value(char, frame + 1)) {
          wiggles++
        }
      }
    }
  }
  return wiggles
}

const P_hat = (start, end, timeline) => {
  const nDuration = end - start
  const totalDuration = timeline[timeline.length - 1] - timeline[0]
  return nDuration / totalDuration
}

function getWeight(start, end) {
  let weight = 0
  const charactersJson = storyJson['Story']['Characters']
  let totalweight = 0
  for (const charName in charactersJson) {
    const charItemList = charactersJson[charName]
    const sFrame = charItemList[0].Start
    const length = charItemList.length
    const eFrame = charItemList[length - 1].End
    totalweight += 1
    if (eFrame > start && sFrame < end) {
      weight += 1
    }
  }
  return weight
  // return weight / totalweight
}

// calculate data description length
function calculateDat(start, end, timeline) {
  const P = P_hat(start, end, timeline)
  const weight = getWeight(start, end)
  const Dat = -weight * Math.log2(P)
  // const Dat = -weight * P * Math.log2(P)
  return Dat
}

function calculateDat_nodes(timeline, nodes) {
  return -nodes.reduce(
    (sum, n) =>
      sum + n.weight * Math.log2(P_hat(n.value[0], n.value[1], timeline)),
    0
    // (sum, n) => sum + n.weight * P_hat(n.value[0], n.value[1], timeline) * Math.log2(P_hat(n.value[0], n.value[1], timeline)), 0
  )
}

// calculate data description length for the node itself
function calculateRootDat(timeline, nodes) {
  const rootNode = nodes[0]
  const rootChildrenNum = rootNode.children.length
  // assume evenly distribution
  const rootP = P_hat(rootNode.value[0], rootNode.value[1], timeline)
  const weight = rootNode.weight
  return -weight * rootChildrenNum * Math.log2(rootP / rootChildrenNum)
  // return -weight * rootP * rootChildrenNum * Math.log2(rootP / rootChildrenNum)
}

function calculateVirtualParentDat(start, split, end, timeline) {
  const P1 = P_hat(start, split, timeline)
  const P2 = P_hat(split, end, timeline)
  const weight = getWeight(start, end)
  const Dat = -weight * 2 * Math.log2((P1 + P2) / 2)
  // const Dat = -weight * (P1 + P2) * 2 * Math.log2((P1 + P2) / 2)
  return Dat
}

// calculate parameter description length
function calculatePar(timeline, clusterNum) {
  const S = timeline.length - 1
  const K = clusterNum
  const Par = (K / 2) * Math.log2(S)
  return Par
}

// Function to filter out valid timeframes
function filterValidTimeFrames(storyJson, iStorylineInstance, timeline) {
  let clusterOrder = []
  let vaildTFs = timeline
  const currTF = { start: 0, spilt: 1, end: 2 }
  const n = timeline.length - 2
  for (let idx = 0; idx < n; idx++) {
    const currTFData = constructSubStoryJson(
      storyJson,
      timeline[currTF.start],
      timeline[currTF.end]
    )
    iStorylineInstance = new iStoryline.default()
    const currTable = iStorylineInstance.load(currTFData).getTable('sort')
    const crossing = countCrossings(currTable)
    if (crossing === 0) {
      vaildTFs = vaildTFs.filter(tf => tf !== timeline[currTF.spilt])
      clusterOrder.push(timeline[currTF.spilt])
      currTF.spilt = currTF.end
      currTF.end = currTF.end + 1
    } else {
      currTF.start = currTF.spilt
      currTF.spilt = currTF.end
      currTF.end = currTF.end + 1
    }
  }
  return { vaildTFs, clusterOrder }
}

// Function to create first layout and full distance list
function createFirstLayoutAndFullDistanceList(
  storyJson,
  iStorylineInstance,
  vaildTFs
) {
  const distList = []
  let firstLayout = []
  for (let idx = 0; idx < vaildTFs.length - 2; idx++) {
    const d = {
      start: vaildTFs[idx],
      split: vaildTFs[idx + 1],
      end: vaildTFs[idx + 2],
    }
    d.data = constructSubStoryJson(storyJson, d.start, d.end)
    d.value = calculateVirtualParentDat(d.start, d.split, d.end, vaildTFs)
    distList.push(d)
  }
  firstLayout = [...vaildTFs]
  return { distList, firstLayout }
}

//convert to tree
function splitArrayIntoPairs(data) {
  var nodes = []
  for (var i = 0; i < data.length - 1; i++) {
    nodes.push({ value: [data[i], data[i + 1]] })
  }
  return nodes
}

function buildTreeNodes(data, clusterOrder, ifMergeTogether) {
  const nodes = splitArrayIntoPairs(data)

  while (nodes.length > 1) {
    var clusterNum = clusterOrder[0]
    let mergeNum = 1
    if (ifMergeTogether[1] === 1) {
      var i = 1
      while (ifMergeTogether[i++] === 1) {
        mergeNum++
      }
    }

    for (var i = 0; i < nodes.length; i++) {
      var currNode = nodes[i]
      if (currNode.value[1] === clusterNum) {
        const newNode = {
          value: [currNode.value[0], nodes[i + mergeNum].value[1]],
          children: [currNode],
        }
        for (var j = 1; j <= mergeNum; j++) {
          newNode.children.push(nodes[i + j])
        }
        nodes[i] = newNode
        nodes.splice(i + 1, mergeNum)
        while (mergeNum--) {
          clusterOrder.shift()
          ifMergeTogether.shift()
        }
      }
    }
  }
  return nodes[0]
}

function buildTree(timeline, clusterOrder, ifMergeTogether) {
  const data = buildTreeNodes(timeline, clusterOrder, ifMergeTogether)
  const tree = new Tree(data.value, data.value)

  if (data.children) {
    for (const child of data.children) {
      buildSubTree(tree, child, tree.root)
    }
  }
  return tree
}

const buildSubTree = (tree, childData, parentNode) => {
  tree.insert(parentNode.key, childData.value)
  const node = new TreeNode(childData.value, childData.value, parentNode)
  if (childData.children) {
    for (const grandchild of childData.children) {
      buildSubTree(tree, grandchild, node)
    }
  }
}

class TreeNode {
  constructor(key, value = key, parent = null, weight = 0) {
    this.key = key
    this.value = value
    this.parent = parent
    this.children = []
    this.weight = weight
  }

  get isLeaf() {
    return this.children.length === 0
  }

  get hasChildren() {
    return !this.isLeaf
  }
}

class Tree {
  constructor(key, value = key) {
    this.root = new TreeNode(key, value)
  }

  *preOrderTraversal(node = this.root) {
    yield node
    if (node.children.length) {
      for (let child of node.children) {
        yield* this.preOrderTraversal(child)
      }
    }
  }

  *postOrderTraversal(node = this.root) {
    if (node.children.length) {
      for (let child of node.children) {
        yield* this.postOrderTraversal(child)
      }
    }
    yield node
  }

  insert(parentNodeKey, key, value = key) {
    for (let node of this.preOrderTraversal()) {
      if (node.key === parentNodeKey) {
        node.children.push(new TreeNode(key, value, node))
        return true
      }
    }
    return false
  }

  remove(key) {
    for (let node of this.preOrderTraversal()) {
      const filtered = node.children.filter(c => c.key !== key)
      if (filtered.length !== node.children.length) {
        node.children = filtered
        return true
      }
    }
    return false
  }

  find(key) {
    for (let node of this.preOrderTraversal()) {
      if (node.key === key) return node
    }
    return undefined
  }

  toString(node = this.root, level = 0) {
    let result = ''
    result += `${'| '.repeat(level)}${node.value}\n`
    for (let child of node.children) {
      result += this.toString(child, level + 1)
    }
    return result
  }
}

const a = 1
// calculate description length
function calculateDescriptionLength(timeline, nodes) {
  return (
    calculatePar(timeline, nodes.length) +
    a * calculateDat_nodes(timeline, nodes)
  )
}

function calculateRootDescriptionLength(timeline, nodes) {
  return (
    calculatePar(timeline, nodes.length) + a * calculateRootDat(timeline, nodes)
  )
}

// select treecut by calculation MDL
const findMDL = (timeline, tree) => {
  // Check if the current node is a leaf node
  if (tree.children.length === 0) {
    return [tree]
  }

  // Recursively find the optimal model for each child subtree
  let optimalModels = []
  for (let i = 0; i < tree.children.length; i++) {
    const childModels = findMDL(timeline, tree.children[i])
    optimalModels = optimalModels.concat(childModels)
  }

  // Check if collapsing the lower-level optimal models reduces the description length
  const rootModelLength = calculateRootDescriptionLength(timeline, [tree])
  const optimalModelLength = calculateDescriptionLength(timeline, optimalModels)
  // console.log('rootModelLength :>> ', rootModelLength)
  // console.log('optimalModelLength :>> ', optimalModelLength)
  if (rootModelLength < optimalModelLength) {
    // if (tree.parent === null) {
    //   console.log('Final MDL: ', rootModelLength)
    // }
    // console.log('return root :>> ')
    return [tree]
  } else {
    // if (tree.parent === null) {
    //   console.log('Final MDL: ', optimalModelLength)
    // }
    // console.log('return optimalModels')
    return optimalModels
  }
}

async function main() {
  var start = Date.now()

  let iStorylineInstance = new iStoryline.default()
  let fullGraph = iStorylineInstance.load(storyJson)
  const timeline = fullGraph.timeline

  let { vaildTFs, clusterOrder } = filterValidTimeFrames(
    storyJson,
    iStorylineInstance,
    timeline
  )

  let { distList, firstLayout } = createFirstLayoutAndFullDistanceList(
    storyJson,
    iStorylineInstance,
    vaildTFs
  )

  let ifMergeTogether = new Array(clusterOrder.length).fill(0)
  let minDist
  let prevMinDist = null
  while (distList.length > 1) {
    // finding the shortest distance between tfs
    let minDistIndex = 0
    let mergeTogether = 0
    minDist = distList[0]
    for (var i = 0; i < distList.length; i++) {
      let dist = distList[i]
      if (dist.value < minDist.value) {
        minDistIndex = i
        minDist = dist
      }
    }
    // if minDist and prevMinDist are equal and adjacent, merge them together
    if (
      prevMinDist &&
      minDist.value == prevMinDist.value &&
      minDist.start == prevMinDist.split
    ) {
      mergeTogether = 1
    }
    prevMinDist = minDist

    // after the shortest distance is found, create new layout
    firstLayout = firstLayout.filter(tf => tf != minDist.split)
    clusterOrder.push(minDist.split)
    ifMergeTogether.push(mergeTogether)

    // remove the original distance object
    distList = distList.filter((_, index) => index != minDistIndex)
  }

  clusterOrder.push(distList[0].split)
  if (
    prevMinDist &&
    distList[0].value == prevMinDist.value &&
    distList[0].start == prevMinDist.split
  ) {
    ifMergeTogether.push(1)
  } else {
    ifMergeTogether.push(0)
  }

  const tree = buildTree(timeline, clusterOrder, ifMergeTogether)
  for (let node of tree.preOrderTraversal()) {
    node.weight = getWeight(node.value[0], node.value[1])
  }

  // find treecut
  const treecut = findMDL(timeline, tree.root)

  var end = Date.now()
  console.log('time: ', end - start)

  // calculate crossings, wiggles and DL
  let totalcrossings = 0
  let totalwiggles = 0
  let Dat = 0
  for (let tf of treecut) {
    const start = tf.value[0]
    const end = tf.value[1]
    const data = constructSubStoryJson(storyJson, start, end)
    iStorylineInstance = new iStoryline.default()
    const currGraph = iStorylineInstance.load(data)
    totalcrossings += countCrossings(currGraph.getTable('sort'))
    totalwiggles += countWiggles(currGraph.getTable('align'))
    Dat += calculateDat(start, end, timeline)
  }
  let Par = calculatePar(timeline, treecut.length)
  let final_DL = Par + Dat
  console.log('total crossings: ', totalcrossings)
  console.log('total wiggles: ', totalwiggles)
  console.log('final DL: ', final_DL)

  // console.log('tree :>> ', tree.toString())
  let partition = []
  partition.push(treecut[0].value[0])
  // console.log('treecut :>> ')
  for (tf of treecut) {
    // console.log(tf.value)
    partition.push(tf.value[1])
  }
  console.log('partition: ', partition)

  return tree
}

main()