describe('Simple Test', () => {
  it('should pass a basic test', () => {
    expect(2 + 2).toBe(4);
  });

  it('should handle strings', () => {
    expect('hello').toBe('hello');
  });

  it('should handle arrays', () => {
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr[0]).toBe(1);
  });
}); 