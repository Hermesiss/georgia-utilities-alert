import {AreaTree} from "../../src/parsers/energoPro/types";
import {getStreets} from "../../src/map";

describe('AreaTree', () => {
  let root: AreaTree;

  beforeEach(() => {
    root = new AreaTree('Root');
  });

  it('should add a new child', () => {
    root.add('Child1', new AreaTree('Child1'));
    expect(root.has('Child1')).toBe(true);
    expect(root.get('Child1')?.nameGe).toBe('Child1');
  });

  it('should sort children by key', () => {
    root.add('Child2', new AreaTree('Child2'));
    root.add('Child1', new AreaTree('Child1'));
    expect([...root.children.keys()]).toEqual(['Child1', 'Child2']);
  });

  it('should merge two trees', () => {
    const tree1 = new AreaTree('Tree1');
    tree1.add('Child1', new AreaTree('Child1'));

    const tree2 = new AreaTree('Tree2');
    tree2.add('Child2', new AreaTree('Child2'));

    tree1.merge(tree2);

    expect(tree1.has('Child1')).toBe(true);
    expect(tree1.has('Child2')).toBe(true);
  });

  it('should merge nested trees', () => {
    const tree1 = new AreaTree('Tree1');
    tree1.add('Child1', new AreaTree('Child1'));
    tree1.get('Child1')?.add('Grandchild1', new AreaTree('Grandchild1'));

    const tree2 = new AreaTree('Tree2');
    tree2.add('Child1', new AreaTree('Child1'));
    tree2.get('Child1')?.add('Grandchild2', new AreaTree('Grandchild2'));

    tree1.merge(tree2);

    expect(tree1.has('Child1')).toBe(true);
    expect(tree1.get('Child1')?.has('Grandchild1')).toBe(true);
    expect(tree1.get('Child1')?.has('Grandchild2')).toBe(true);
  });

  it('should return empty string for getAdditionalData', () => {
    expect(root.getAdditionalData()).toBe('');
  });

  it('should populate the tree with the given areas', () => {
    const areaTree = new AreaTree('Root');
    const areas = [
      'Street A / Street B / Street C',
      'Street A / Street B / Street D',
      'Street A / Street E',
    ];

    areaTree.populate(areas);

    // Check if the tree is populated correctly
    expect(areaTree.get('Street A')).toBeTruthy();
    expect(areaTree.get('Street A')?.get('Street B')).toBeTruthy();
    expect(areaTree.get('Street A')?.get('Street B')?.get('Street C')).toBeTruthy();
    expect(areaTree.get('Street A')?.get('Street B')?.get('Street D')).toBeTruthy();
    expect(areaTree.get('Street A')?.get('Street E')).toBeTruthy();

    // Check if there are no additional branches
    expect(areaTree.get('Street F')).toBeFalsy();
    expect(areaTree.get('Street A')?.get('Street G')).toBeFalsy();
  });
});

describe('getStreets', () => {
  let tree: AreaTree;

  beforeEach(() => {
    tree = new AreaTree('Root');
    const city1 = new AreaTree('City1');
    city1.add('Street1', new AreaTree('Street1'));
    city1.add('Street2', new AreaTree('Street2'));
    tree.add('City1', city1);

    const city2 = new AreaTree('City2');
    city2.add('Street3', new AreaTree('Street3'));
    tree.add('City2', city2);
  });

  it('should return all streets when no city is provided', async () => {
    const streets = await getStreets(tree, null);
    expect([...streets]).toEqual(['Street1', 'Street2', 'Street3']);
  });

  it('should return streets only for a specified city', async () => {
    const streets = await getStreets(tree, 'City1');
    expect([...streets]).toEqual(['Street1', 'Street2']);
  });

  it('should return an empty set when the city is not found', async () => {
    const streets = await getStreets(tree, 'NonExistentCity');
    expect([...streets]).toEqual([]);
  });

  it('should return an empty set when the level is greater than 5', async () => {
    const streets = await getStreets(tree, null, 6);
    expect([...streets]).toEqual([]);
  });
});
