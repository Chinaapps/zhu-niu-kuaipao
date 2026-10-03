/* =========================================================================
 * Liquid Glass 数学计算引擎 & 计算器界面 (网页版)
 *
 * 纯计算器 —— 不含任何单位换算。任意精度、任意大数，等待即可完成，不会超时。
 *
 * 引擎与 calculator.py（Python 版）保持同一套运算规则：
 *   - 整数/分数：使用 BigInt 实现精确有理数（无限精度），四则运算、乘方、取模、整数除法全部精确。
 *   - 超越函数（sin/cos/tan/ln/exp/开方等）：基于 BigInt 定点高精度小数 + 泰勒级数，逐项收敛。
 *   - 常数 pi/e/ln2 由级数按需生成。
 * ========================================================================= */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 精度设置
   * ------------------------------------------------------------------ */
  var PREC = 50;              // 显示小数位数
  var SCL = PREC + 16;        // 定点小数内部位数（=10^SCL 为一个单位）
  var P10 = 10n ** BigInt(SCL);
  var ONE = new Hp(10n ** BigInt(SCL));

  /* ------------------------------------------------------------------ *
   * 高精度定点小数 Hp：value = coeff / 10^SCL
   * ------------------------------------------------------------------ */
  function Hp(coeff) { this.c = coeff; }
  Hp.prototype.clone = function () { return new Hp(this.c); };

  function hpInt(x) { return new Hp(BigInt(x) * P10); }
  function hpZero() { return new Hp(0n); }
  function hpOne() { return new Hp(P10); }
  function hpNeg(a) { return new Hp(-a.c); }
  function hpAbs(a) { return new Hp(a.c < 0n ? -a.c : a.c); }
  function hpAdd(a, b) { return new Hp(a.c + b.c); }
  function hpSub(a, b) { return new Hp(a.c - b.c); }
  function hpMul(a, b) { return new Hp((a.c * b.c) / P10); }
  function hpDiv(a, b) {
    if (b.c === 0n) throw new Error('除以零');
    return new Hp((a.c * P10) / b.c);
  }
  function hpIsZero(a) { return a.c === 0n; }
  function hpEq(a, b) { return a.c === b.c; }
  function hpLt(a, b) { return a.c < b.c; }
  function hpGt(a, b) { return a.c > b.c; }
  function hpLte(a, b) { return a.c <= b.c; }
  function hpGte(a, b) { return a.c >= b.c; }

  // 由有理数构造 Hp（四舍五入）
  function hpFromRat(r) {
    var neg = r.n < 0n;
    var an = neg ? -r.n : r.n;
    var ad = r.d < 0n ? -r.d : r.d;
    var q = (an * P10) / ad;
    var rem = (an * P10) % ad;
    if (rem * 2n >= ad) q += 1n;
    return new Hp(neg ? -q : q);
  }

  // BigInt 整数平方根（向下取整）
  function isqrt(n) {
    if (n < 0n) throw new Error('负数不能开平方');
    if (n < 2n) return n;
    var x = n, y = (x + n / x) / 2n;
    while (y < x) { x = y; y = (x + n / x) / 2n; }
    return x;
  }
  function hpSqrt(a) {
    if (a.c < 0n) throw new Error('负数不能开平方');
    return new Hp(isqrt(a.c * P10));
  }

  function hpPowInt(a, n) {
    var neg = n < 0;
    if (neg) n = -n;
    var base = a.clone(), result = hpOne();
    while (n > 0) {
      if (n & 1) result = hpMul(result, base);
      base = hpMul(base, base);
      n = Math.floor(n / 2);
    }
    if (neg) return hpDiv(hpOne(), result);
    return result;
  }

  // Hp -> 字符串（最多 prec 位小数，去尾零）
  function hpToStr(a, prec) {
    prec = (prec === undefined) ? PREC : prec;
    var neg = a.c < 0n;
    var c = neg ? -a.c : a.c;
    var intPart = c / P10;
    var fracBig = c % P10;
    var tenPrec = 10n ** BigInt(prec);
    var digitsBig = (fracBig * tenPrec + P10 / 2n) / P10;
    if (digitsBig >= tenPrec) { digitsBig -= tenPrec; intPart += 1n; }
    var ds = digitsBig.toString().padStart(prec, '0').replace(/0+$/, '');
    var res = intPart.toString();
    if (ds) res += '.' + ds;
    return (neg ? '-' : '') + res;
  }

  /* ------------------------------------------------------------------ *
   * 精确有理数 BigRat
   * ------------------------------------------------------------------ */
  function gcdBig(a, b) {
    a = a < 0n ? -a : a; b = b < 0n ? -b : b;
    while (b) { var t = a % b; a = b; b = t; }
    return a || 1n;
  }
  function BigRat(n, d) {
    if (d === undefined || d === null) d = 1n;
    if (d === 0n) throw new Error('分母为零');
    if (d < 0n) { n = -n; d = -d; }
    if (n === 0n) { d = 1n; }
    else { var g = gcdBig(n, d); n /= g; d /= g; }
    this.n = n; this.d = d;
  }
  BigRat.prototype.neg = function () { return new BigRat(-this.n, this.d); };
  BigRat.prototype.abs = function () { return new BigRat(this.n < 0n ? -this.n : this.n, this.d); };
  BigRat.prototype.add = function (o) { return new BigRat(this.n * o.d + o.n * this.d, this.d * o.d); };
  BigRat.prototype.sub = function (o) { return new BigRat(this.n * o.d - o.n * this.d, this.d * o.d); };
  BigRat.prototype.mul = function (o) { return new BigRat(this.n * o.n, this.d * o.d); };
  BigRat.prototype.div = function (o) {
    if (o.n === 0n) throw new Error('除以零');
    return new BigRat(this.n * o.d, this.d * o.n);
  };
  BigRat.prototype.floordiv = function (o) {
    return new BigRat((this.n * o.d) / (this.d * o.n));
  };
  BigRat.prototype.mod = function (o) {
    return this.sub(this.floordiv(o).mul(o));
  };
  BigRat.prototype.eq = function (o) { return this.n * o.d === o.n * this.d; };
  BigRat.prototype.lt = function (o) { return this.n * o.d < o.n * this.d; };
  BigRat.prototype.gt = function (o) { return this.n * o.d > o.n * this.d; };
  BigRat.prototype.isInt = function () { return this.d === 1n; };
  BigRat.prototype.powInt = function (k) {
    if (typeof k !== 'bigint') k = BigInt(k);
    if (k >= 0n) return new BigRat(this.n ** k, this.d ** k);
    if (this.n === 0n) throw new Error('零的负次幂');
    return new BigRat(this.d ** (-k), this.n ** (-k));
  };
  // 字符串：有限小数给精确值，无限小数给高精度近似
  BigRat.prototype.toStr = function (maxDigits) {
    var digits = maxDigits === undefined ? PREC : maxDigits;
    if (this.d === 1n) return this.n.toString();
    var sign = (this.n < 0n) !== (this.d < 0n) ? '-' : '';
    var num = this.n < 0n ? -this.n : this.n;
    var den = this.d < 0n ? -this.d : this.d;
    var intPart = num / den, rem = num % den;
    // 判断有限小数
    var d2 = den;
    while (d2 % 2n === 0n) d2 /= 2n;
    while (d2 % 5n === 0n) d2 /= 5n;
    var out = sign + intPart.toString();
    if (d2 === 1n) {
      var frac = '';
      var guard = 0;
      while (rem !== 0n && guard < 200000) {
        frac += ((rem * 10n) / den).toString();
        rem = (rem * 10n) % den;
        guard++;
      }
      return frac ? out + '.' + frac : out;
    }
    // 无限小数：高精度近似
    var v = hpFromRat(this);
    return hpToStr(v, digits);
  };

  /* ------------------------------------------------------------------ *
   * 统一数值 Value：{rat: BigRat|null, hp: Hp|null}，二者恰好一个非空
   * ------------------------------------------------------------------ */
  function VRat(r) { return { rat: r, hp: null }; }
  function VHp(h) { return { rat: null, hp: h }; }
  function isRat(v) { return v !== null && v !== undefined && typeof v === 'object' && v.rat !== null && v.hp === null; }
  function asHp(v) { return v.hp !== null ? v.hp : hpFromRat(v.rat); }
  function vAdd(a, b) {
    if (isRat(a) && isRat(b)) return VRat(a.rat.add(b.rat));
    return VHp(hpAdd(asHp(a), asHp(b)));
  }
  function vSub(a, b) {
    if (isRat(a) && isRat(b)) return VRat(a.rat.sub(b.rat));
    return VHp(hpSub(asHp(a), asHp(b)));
  }
  function vMul(a, b) {
    if (isRat(a) && isRat(b)) return VRat(a.rat.mul(b.rat));
    return VHp(hpMul(asHp(a), asHp(b)));
  }
  function vDiv(a, b) {
    if (isRat(a) && isRat(b)) return VRat(a.rat.div(b.rat));
    return VHp(hpDiv(asHp(a), asHp(b)));
  }
  function vMod(a, b) {
    if (isRat(a) && isRat(b)) return VRat(a.rat.mod(b.rat));
    return VHp(hpMod(asHp(a), asHp(b)));
  }
  function vPow(a, b) {
    if (isRat(b) && b.rat.isInt()) {
      var k = b.rat.n; // b.rat.d === 1
      if (isRat(a)) return VRat(a.rat.powInt(k));
      return VHp(hpPowInt(asHp(a), Number(k)));
    }
    if (isRat(a) && isRat(b) && b.rat.d === 1n) return VRat(a.rat.powInt(b.rat.n));
    return VHp(hpPowHp(asHp(a), asHp(b)));
  }
  function hpFloor(a, b) {
    // floor(a/b) 用于 % ：先算商向下取整再乘回
    var q = (a.c * P10) / b.c;          // trunc toward zero
    var rr = (a.c * P10) % b.c;
    if (rr !== 0n && ((a.c < 0n) !== (b.c < 0n))) q -= 1n; // toward -inf
    return q;
  }
  function vFloorDiv(a, b) {
    if (isRat(a) && isRat(b)) return VRat(a.rat.floordiv(b.rat));
    var q = (asHp(a).c * P10) / asHp(b).c;
    var rr = (asHp(a).c * P10) % asHp(b).c;
    if (rr !== 0n && ((asHp(a).c < 0n) !== (asHp(b).c < 0n))) q -= 1n;
    return VHp(new Hp(q * P10 / P10));
  }

  function hpPowHp(a, b) {
    // a^b（b 非整数）: exp(b * ln(a))
    if (a.c < 0n) throw new Error('负数的非整数次幂未定义');
    if (hpIsZero(a)) {
      if (hpLt(b, hpZero())) throw new Error('零的负次幂');
      return hpZero();
    }
    return hpExp(hpMul(b, hpLn(a)));
  }

  function vNeg(a) { return isRat(a) ? VRat(a.rat.neg()) : VHp(hpNeg(a.hp)); }
  function vAbs(a) { return isRat(a) ? VRat(a.rat.abs()) : VHp(hpAbs(a.hp)); }

  function vCmp(a, b) {
    // 返回 -1/0/1
    if (isRat(a) && isRat(b)) return a.rat.lt(b.rat) ? -1 : (a.rat.gt(b.rat) ? 1 : 0);
    var x = asHp(a), y = asHp(b);
    return x.c < y.c ? -1 : (x.c > y.c ? 1 : 0);
  }
  function vGt(a, b) { return vCmp(a, b) > 0; }
  function vLt(a, b) { return vCmp(a, b) < 0; }

  function vToStr(v) {
    return isRat(v) ? v.rat.toStr(PREC) : hpToStr(v.hp, PREC);
  }
  function vToFullStr(v) {
    if (isRat(v)) return v.rat.isInt() ? v.rat.n.toString() : v.rat.toStr(PREC);
    return hpToStr(v.hp, PREC);
  }

  /* ------------------------------------------------------------------ *
   * 常数（级数生成，Hp）
   * ------------------------------------------------------------------ */
  function hpAtanSeries(x) {
    var x2 = hpMul(x, x);
    var t = x.clone(), s = hpZero(), n = 1;
    var tol = 10n ** BigInt(SCL - PREC - 6);
    for (var guard = 0; guard < 100000; guard++) {
      s = hpAdd(s, hpDiv(t, hpInt(n)));
      n += 2;
      t = hpMul(t, hpNeg(x2));
      if (t.c < 0n ? -t.c : t.c) ; // no-op
      if ((t.c < 0n ? -t.c : t.c) < tol) break;
    }
    return s;
  }
  var _PI = null;
  function hpPi() {
    if (_PI) return _PI;
    var one = hpOne();
    var a5 = hpDiv(one, hpInt(5));
    var a239 = hpDiv(one, hpInt(239));
    _PI = hpSub(hpMul(hpInt(16), hpAtanSeries(a5)), hpMul(hpInt(4), hpAtanSeries(a239)));
    return _PI;
  }
  var _E = null;
  function hpE() {
    if (_E) return _E;
    var s = hpOne(), t = hpOne(), k = 1;
    var tol = 10n ** BigInt(SCL - PREC - 6);
    for (var guard = 0; guard < 200000; guard++) {
      t = hpDiv(t, hpInt(k));
      s = hpAdd(s, t);
      k++;
      if ((t.c < 0n ? -t.c : t.c) < tol) break;
    }
    _E = s;
    return _E;
  }
  var _LN2 = null;
  function hpLn2() {
    if (_LN2) return _LN2;
    var x = hpDiv(hpOne(), hpInt(3));
    var x2 = hpMul(x, x);
    var t = x.clone(), s = hpZero(), n = 1;
    var tol = 10n ** BigInt(SCL - PREC - 6);
    for (var guard = 0; guard < 100000; guard++) {
      s = hpAdd(s, hpDiv(t, hpInt(n)));
      n += 2;
      t = hpMul(t, x2);
      if ((t.c < 0n ? -t.c : t.c) < tol) break;
    }
    _LN2 = hpMul(s, hpInt(2));
    return _LN2;
  }

  /* ------------------------------------------------------------------ *
   * 超越函数（镜像 Python 引擎）
   * ------------------------------------------------------------------ */
  function hpLn(x) {
    if (x.c <= 0n) throw new Error('ln 的定义域为 x>0');
    var e = hpE();
    var n = 0;
    var two = hpInt(2);
    while (hpGt(x, two)) { x = hpDiv(x, e); n++; }
    var half = hpDiv(hpOne(), hpInt(2));
    while (hpLt(x, half)) { x = hpMul(x, e); n--; }
    var one = hpOne();
    var y = hpDiv(hpSub(x, one), hpAdd(x, one));
    var y2 = hpMul(y, y);
    var s = hpZero(), t = y.clone(), k = 1;
    var tol = 10n ** BigInt(SCL - PREC - 6);
    for (var guard = 0; guard < 200000; guard++) {
      s = hpAdd(s, hpDiv(t, hpInt(k)));
      k += 2;
      t = hpMul(t, y2);
      if ((t.c < 0n ? -t.c : t.c) < tol) break;
    }
    return hpAdd(hpInt(n), hpMul(hpInt(2), s));
  }
  function hpExp(x) {
    var ln2 = hpLn2();
    var one = hpOne();
    var n = 0;
    while (hpGt(x, one)) { x = hpSub(x, ln2); n++; }
    while (hpLt(x, hpNeg(one))) { x = hpAdd(x, ln2); n--; }
    var s = hpOne(), t = hpOne(), k = 1;
    var tol = 10n ** BigInt(SCL - PREC - 6);
    for (var guard = 0; guard < 200000; guard++) {
      t = hpMul(t, hpDiv(x, hpInt(k)));
      s = hpAdd(s, t);
      k++;
      if ((t.c < 0n ? -t.c : t.c) < tol) break;
    }
    return hpMul(s, hpPowInt(hpInt(2), n));
  }
  function hpSinCos(x) {
    // 约化到 [-pi,pi]
    var tau = hpMul(hpPi(), hpInt(2));
    var r = hpDiv(x, tau);
    // 取小数部分：r - floor(r)
    var rf = r.c / P10; // 整数部分
    var rr = r.c % P10;
    if (rr !== 0n && r.c < 0n) rf -= 1n;
    var frac = hpSub(r, hpInt(rf));
    var xx = hpMul(frac, tau);
    var pi = hpPi();
    var half = hpDiv(pi, hpInt(2));
    if (hpGt(xx, half)) xx = hpSub(pi, xx);
    else if (hpLt(xx, hpNeg(half))) xx = hpNeg(hpAdd(pi, xx));
    var x2 = hpMul(xx, xx);
    var tol = 10n ** BigInt(SCL - PREC - 6);
    // sin
    var s = xx.clone(), t = xx.clone(), n = 1;
    for (var g = 0; g < 200000; g++) {
      t = hpMul(t, hpNeg(hpDiv(x2, hpInt((2 * n) * (2 * n + 1)))));
      s = hpAdd(s, t);
      n++;
      if ((t.c < 0n ? -t.c : t.c) < tol) break;
    }
    // cos
    var c = hpOne(), ct = hpOne();
    n = 1;
    for (var g2 = 0; g2 < 200000; g2++) {
      ct = hpMul(ct, hpNeg(hpDiv(x2, hpInt((2 * n - 1) * (2 * n)))));
      c = hpAdd(c, ct);
      n++;
      if ((ct.c < 0n ? -ct.c : ct.c) < tol) break;
    }
    return [s, c];
  }
  function hpAtan(x) {
    var neg = x.c < 0n;
    var ax = hpAbs(x);
    var one = hpOne();
    var flip = hpGt(ax, one);
    if (flip) ax = hpDiv(one, ax);
    var u = hpDiv(ax, hpAdd(one, hpSqrt(hpAdd(one, hpMul(ax, ax)))));
    var res = hpMul(hpAtanSeries(u), hpInt(2));
    if (flip) res = hpSub(hpDiv(hpPi(), hpInt(2)), res);
    return neg ? hpNeg(res) : res;
  }

  /* ------------------------------------------------------------------ *
   * 数论 / 组合（BigInt 精确）
   * ------------------------------------------------------------------ */
  function toBigInt(v) {
    if (isRat(v)) {
      if (!v.rat.isInt()) throw new Error('该函数仅接受整数');
      return v.rat.n;
    }
    throw new Error('该函数仅接受整数');
  }
  function vGcd(a, b) { return VRat(new BigRat(gcdBig(toBigInt(a), toBigInt(b)))); }
  function vLcm(a, b) {
    var x = toBigInt(a), y = toBigInt(b);
    if (x === 0n || y === 0n) return VRat(new BigRat(0n));
    return VRat(new BigRat((x < 0n ? -x : x) * (y < 0n ? -y : y) / gcdBig(x, y)));
  }
  var MILLER = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
  function isPrimeBig(n) {
    if (n < 2n) return false;
    for (var i = 0; i < MILLER.length; i++) {
      var p = MILLER[i];
      if (n === p) return true;
      if (n % p === 0n) return false;
    }
    var d = n - 1n, s = 0;
    while (d % 2n === 0n) { d /= 2n; s++; }
    outer:
    for (i = 0; i < MILLER.length; i++) {
      var a = MILLER[i];
      if (a >= n) continue;
      var x = modPow(a, d, n);
      if (x === 1n || x === n - 1n) continue;
      for (var r = 0; r < s - 1; r++) {
        x = (x * x) % n;
        if (x === n - 1n) continue outer;
      }
      return false;
    }
    return true;
  }
  function modPow(base, exp, mod) {
    var result = 1n;
    base %= mod;
    while (exp > 0n) {
      if (exp & 1n) result = (result * base) % mod;
      base = (base * base) % mod;
      exp >>= 1n;
    }
    return result;
  }
  function vIsPrime(a) { return isPrimeBig(toBigInt(a)); }
  function vNextPrime(a) {
    var n = toBigInt(a) + 1n;
    while (!isPrimeBig(n)) n++;
    return VRat(new BigRat(n));
  }
  function vFactorial(a) {
    var n = toBigInt(a);
    if (n < 0n) throw new Error('负数的阶乘未定义');
    var r = 1n;
    for (var i = 2n; i <= n; i++) r *= i;
    return VRat(new BigRat(r));
  }
  function vNcr(a, b) {
    var n = toBigInt(a), r = toBigInt(b);
    if (n < 0n || r < 0n || r > n) throw new Error('组合数参数非法');
    if (r > n - r) r = n - r;
    var num = 1n, den = 1n;
    for (var i = 1n; i <= r; i++) { num *= (n - r + i); den *= i; }
    return VRat(new BigRat(num, den));
  }
  function vNpr(a, b) {
    var n = toBigInt(a), r = toBigInt(b);
    if (n < 0n || r < 0n || r > n) throw new Error('排列数参数非法');
    var res = 1n;
    for (var i = 0n; i < r; i++) res *= (n - i);
    return VRat(new BigRat(res));
  }
  function vFactorize(a) {
    var n = toBigInt(a);
    if (n < 0n) n = -n;
    if (n < 2n) return [];
    var res = [];
    var d = 2n;
    while (d * d <= n) {
      if (n % d === 0n) {
        var c = 0;
        while (n % d === 0n) { n /= d; c++; }
        res.push([d.toString(), c]);
      }
      d += (d === 2n ? 1n : 2n);
    }
    if (n > 1n) res.push([n.toString(), 1]);
    return res;
  }

  /* ------------------------------------------------------------------ *
   * 递归下降表达式解析器（镜像 Python）
   * ------------------------------------------------------------------ */
  var NUM_RE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;

  function Parser(s) {
    this.s = s; this.i = 0; this.n = s.length;
  }
  Parser.prototype.skip = function () {
    while (this.i < this.n && /\s/.test(this.s[this.i])) this.i++;
  };
  Parser.prototype.peek = function () {
    this.skip();
    return this.i < this.n ? this.s[this.i] : '';
  };
  Parser.prototype.parse = function () {
    var v = this.expr();
    this.skip();
    if (this.i < this.n) throw new Error('无法解析的位置: ' + this.s.slice(this.i));
    return v;
  };
  Parser.prototype.expr = function () {
    var v = this.term();
    for (;;) {
      var op = this.peek();
      if (op === '+') { this.i++; v = vAdd(v, this.term()); }
      else if (op === '-') { this.i++; v = vSub(v, this.term()); }
      else return v;
    }
  };
  Parser.prototype.term = function () {
    var v = this.power();
    for (;;) {
      this.skip();
      if (this.s.substr(this.i, 2) === '//') { this.i += 2; v = vFloorDiv(v, this.power()); continue; }
      var op = this.peek();
      if (op === '*') { this.i++; v = vMul(v, this.power()); }
      else if (op === '/') { this.i++; v = vDiv(v, this.power()); }
      else if (op === '%') { this.i++; v = vMod(v, this.power()); }
      else return v;
    }
  };
  Parser.prototype.power = function () {
    var base = this.unary();
    this.skip();
    if (this.s.substr(this.i, 2) === '**') { this.i += 2; return vPow(base, this.power()); }
    return base;
  };
  Parser.prototype.unary = function () {
    var op = this.peek();
    if (op === '+') { this.i++; return this.unary(); }
    if (op === '-') { this.i++; return vNeg(this.unary()); }
    return this.atom();
  };
  Parser.prototype.atom = function () {
    this.skip();
    var c = this.peek();
    if (c === '(') {
      this.i++;
      var v = this.expr();
      if (this.peek() !== ')') throw new Error('缺少右括号');
      this.i++;
      return v;
    }
    if (/[0-9.]/.test(c)) {
      var m = this.s.slice(this.i).match(NUM_RE);
      this.i += m[0].length;
      return VRat(parseRat(m[0]));
    }
    if (/[A-Za-z_]/ .test(c) || c === 'π' || c === 'φ' || c === 'τ') {
      return this.callOrConst();
    }
    throw new Error('意外的字符: ' + c);
  };
  function parseRat(str) {
    if (/[eE]/.test(str)) {
      var m = str.match(/^([+-]?\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
      var mant = new BigRat(BigInt(m[1].replace('.', '')) || 0n, 10n ** BigInt((m[1].split('.')[1] || '').length));
      var e = parseInt(m[2], 10);
      if (m[1].indexOf('.') >= 0) e -= (m[1].split('.')[1] || '').length;
      var negExp = e < 0;
      var p10 = 10n ** BigInt(Math.abs(e));
      return negExp ? mant.div(new BigRat(p10)) : mant.mul(new BigRat(p10));
    }
    if (str.indexOf('.') < 0) return new BigRat(BigInt(str));
    var neg = str[0] === '-';
    var ss = neg ? str.slice(1) : str;
    var parts = ss.split('.');
    var intP = parts[0] === '' ? '0' : parts[0];
    var fracP = parts[1] || '';
    var num = BigInt(intP + fracP);
    var den = 10n ** BigInt(fracP.length);
    var r = new BigRat(num, den);
    return neg ? r.neg() : r;
  }
  Parser.prototype.callOrConst = function () {
    var start = this.i;
    while (this.i < this.n && (/[A-Za-z0-9_]/ .test(this.s[this.i]) || this.s[this.i] === 'π' || this.s[this.i] === 'φ' || this.s[this.i] === 'τ')) this.i++;
    var name = this.s.slice(start, this.i);
    this.skip();
    if (this.peek() === '(') {
      this.i++;
      var args = [];
      if (this.peek() !== ')') {
        for (;;) {
          args.push(this.expr());
          this.skip();
          if (this.peek() === ',') { this.i++; continue; }
          break;
        }
      }
      if (this.peek() !== ')') throw new Error('函数调用缺少右括号');
      this.i++;
      return applyFn(name, args);
    }
    if (name === 'pi' || name === 'π') return VHp(hpPi());
    if (name === 'e') return VHp(hpE());
    if (name === 'phi' || name === 'φ') return VHp(hpDiv(hpAdd(hpOne(), hpSqrt(hpInt(5))), hpInt(2)));
    if (name === 'tau' || name === 'τ') return VHp(hpMul(hpPi(), hpInt(2)));
    if (name === 'ln2') return VHp(hpLn2());
    throw new Error('未知标识符: ' + name);
  };

  function req1(fn, a) { if (a.length !== 1) throw new Error('该函数需要一个参数'); return fn(a[0]); }
  function req2(fn, a) { if (a.length !== 2) throw new Error('该函数需要两个参数'); return fn(a[0], a[1]); }
  function fnLog(a) {
    if (a.length === 1) return VHp(hpDiv(hpLn(asHp(a[0])), hpLn(hpInt(10))));
    if (a.length === 2) return VHp(hpDiv(hpLn(asHp(a[0])), hpLn(asHp(a[1]))));
    throw new Error('log 需要一个或两个参数');
  }
  function fnFloor(a) {
    var x = a[0];
    if (isRat(x)) return VRat(x.rat.floordiv(new BigRat(1n)));
    return VHp(new Hp((x.hp.c / P10) * P10));
  }
  function fnCeil(a) {
    var x = req1(function (v) { return v; }, a);
    if (isRat(x)) {
      var q = x.rat.floordiv(new BigRat(1n));
      return VRat(x.rat.eq(q) ? q : q.add(new BigRat(1n)));
    }
    var q = x.hp.c / P10;
    if (x.hp.c % P10 !== 0n) q += 1n;
    return VHp(new Hp(q * P10));
  }
  function fnMin(a) {
    if (!a.length) throw new Error('min 需要至少一个参数');
    var r = a[0];
    for (var i = 1; i < a.length; i++) if (vLt(a[i], r)) r = a[i];
    return r;
  }
  function fnMax(a) {
    if (!a.length) throw new Error('max 需要至少一个参数');
    var r = a[0];
    for (var i = 1; i < a.length; i++) if (vGt(a[i], r)) r = a[i];
    return r;
  }
  function fnMod(a) {
    var x = a[0], y = a[1];
    if (isRat(x) && isRat(y)) return VRat(x.rat.mod(y.rat));
    return VHp(hpMod(asHp(x), asHp(y)));
  }
  function hpMod(a, b) {
    var q = (a.c * P10) / b.c;
    var rr = (a.c * P10) % b.c;
    if (rr !== 0n && ((a.c < 0n) !== (b.c < 0n))) q -= 1n;
    return hpSub(a, hpMul(new Hp(q * P10 / P10), b));
  }

  var FUNCS = {
    sin: function (a) { if (a.length !== 1) throw new Error('该函数需要一个参数'); return VHp(hpSinCos(asHp(a[0]))[0]); },
    cos: function (a) { if (a.length !== 1) throw new Error('该函数需要一个参数'); return VHp(hpSinCos(asHp(a[0]))[1]); },
    tan: function (a) {
      var sc = hpSinCos(asHp(a[0]));
      if (sc[1].c === 0n) throw new Error('tan 在奇数倍 pi/2 处未定义');
      return VHp(hpDiv(sc[0], sc[1]));
    },
    asin: function (a) { var x = asHp(a[0]); if (x.c < -P10 || x.c > P10) throw new Error('asin 定义域 [-1,1]'); return VHp(hpAtan(hpDiv(x, hpSqrt(hpSub(hpOne(), hpMul(x, x)))))); },
    acos: function (a) { var x = asHp(a[0]); if (x.c < -P10 || x.c > P10) throw new Error('acos 定义域 [-1,1]'); return VHp(hpSub(hpDiv(hpPi(), hpInt(2)), hpAtan(hpDiv(x, hpSqrt(hpSub(hpOne(), hpMul(x, x))))))); },
    atan: function (a) { return VHp(hpAtan(asHp(a[0]))); },
    sinh: function (a) { var x = asHp(a[0]); return VHp(hpDiv(hpSub(hpExp(x), hpExp(hpNeg(x))), hpInt(2))); },
    cosh: function (a) { var x = asHp(a[0]); return VHp(hpDiv(hpAdd(hpExp(x), hpExp(hpNeg(x))), hpInt(2))); },
    tanh: function (a) { var x = asHp(a[0]); var e = hpExp(hpMul(hpInt(2), x)); return VHp(hpDiv(hpSub(e, hpOne()), hpAdd(e, hpOne()))); },
    ln: function (a) { return VHp(hpLn(asHp(a[0]))); },
    log: fnLog,
    log10: function (a) { return VHp(hpDiv(hpLn(asHp(a[0])), hpLn(hpInt(10)))); },
    log2: function (a) { return VHp(hpDiv(hpLn(asHp(a[0])), hpLn2())); },
    exp: function (a) { return VHp(hpExp(asHp(a[0]))); },
    sqrt: function (a) { return VHp(hpSqrt(asHp(a[0]))); },
    cbrt: function (a) {
      var x = asHp(a[0]); var neg = x.c < 0n; var ax = hpAbs(x);
      var third = hpDiv(hpOne(), hpInt(3));
      var r = hpExp(hpMul(third, hpLn(ax)));
      return VHp(neg ? hpNeg(r) : r);
    },
    root: function (a) {
      var x = asHp(a[0]), n = asHp(a[1]);
      if (n.c === 0n) throw new Error('0 次根未定义');
      if (x.c < 0n) { if (n.c % 2n === 0n) throw new Error('偶数次根要求非负'); return VHp(hpNeg(hpExp(hpDiv(hpLn(hpAbs(x)), n)))); }
      return VHp(hpExp(hpDiv(hpLn(x), n)));
    },
    abs: function (a) { return vAbs(a[0]); },
    sign: function (a) { var v = a[0]; var c = vCmp(v, VRat(new BigRat(0n))); return VRat(new BigRat(c > 0 ? 1n : (c < 0 ? -1n : 0n))); },
    gcd: function (a) { return vGcd(a[0], a[1]); },
    lcm: function (a) { return vLcm(a[0], a[1]); },
    fact: function (a) { return vFactorial(a[0]); },
    factorial: function (a) { return vFactorial(a[0]); },
    nCr: function (a) { return vNcr(a[0], a[1]); },
    nPr: function (a) { return vNpr(a[0], a[1]); },
    isprime: function (a) { return vIsPrime(a[0]); },
    nextprime: function (a) { return vNextPrime(a[0]); },
    factor: function (a) { return vFactorize(a[0]); },
    floor: fnFloor,
    ceil: fnCeil,
    min: fnMin,
    max: fnMax,
    mod: fnMod
  };
  function applyFn(name, a) {
    var f = FUNCS[name];
    if (!f) throw new Error('未知函数: ' + name);
    return f(a);
  }

  /* ------------------------------------------------------------------ *
   * 对外接口
   * ------------------------------------------------------------------ */
  function evaluate(expr, digits) {
    if (digits !== undefined && typeof digits === 'number' && digits >= 10) PREC = digits, SCL = PREC + 16, P10 = 10n ** BigInt(SCL), ONE = new Hp(P10);
    var clean = expr
      .replace(/\^/g, '**').replace(/×/g, '*').replace(/÷/g, '/')
      .replace(/−/g, '-').replace(/π/g, 'pi').replace(/φ/g, 'phi').replace(/τ/g, 'tau');
    try {
      var v = new Parser(clean).parse();
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (Array.isArray(v)) {
        return v.map(function (f) { return f[1] > 1 ? f[0] + '^' + f[1] : f[0]; }).join(' × ');
      }
      if (isRat(v) && v.rat.isInt()) return v.rat.n.toString();
      if (isRat(v)) return v.rat.toStr(PREC);
      return hpToStr(v.hp, PREC);
    } catch (e) {
      return '错误: ' + e.message;
    }
  }
  function setPrecision(d) {
    PREC = Math.max(10, Math.floor(d));
    SCL = PREC + 16; P10 = 10n ** BigInt(SCL); ONE = new Hp(P10);
    _PI = null; _E = null; _LN2 = null;
  }
  function engineInfo() { return { precision: PREC }; }

  // 供浏览器全局调用
  if (typeof window !== 'undefined') {
    window.CalcEngine = { evaluate: evaluate, setPrecision: setPrecision, info: engineInfo };
  }

  // 供 Node 测试
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { evaluate: evaluate, setPrecision: setPrecision, info: engineInfo };
  }
})();

/* =========================================================================
 * 界面交互层（liquid glass 计算器）
 * ========================================================================= */
(function () {
  'use strict';
  var EN = window.CalcEngine;
  if (!EN) return;

  var $ = function (id) { return document.getElementById(id); };
  var exprEl = $('expr'), resultEl = $('result'), hintEl = $('hint');

  var precision = 50;
  var lastResult = null;   // 最近一次计算结果的字符串
  var justEqualed = false;
  var history = [];

  /* ---------- 表达式操作 ---------- */
  function getExpr() { return exprEl.value; }
  function setExpr(v) { exprEl.value = v; moveCaretEnd(); updateHint(); }
  function moveCaretEnd() {
    exprEl.focus();
    var len = exprEl.value.length;
    exprEl.setSelectionRange(len, len);
  }
  function insert(text) {
    if (justEqualed) {
      // 等号之后：数字/函数 重新开始，运算符 继续
      if (/[0-9.]/.test(text) && text.length === 1) { setExpr(text); }
      else if (/[a-z]/.test(text) && text.endsWith('(')) { setExpr(text); }
      else if (/^[+\-×÷^%//]$/.test(text) || text === '(') { setExpr((lastResult || '') + text); }
      else { setExpr(text); }
      justEqualed = false;
    } else {
      exprEl.value += text;
      moveCaretEnd();
      updateHint();
    }
  }

  function backspace() {
    if (justEqualed) { setExpr(''); justEqualed = false; resultEl.textContent = '0'; resultEl.classList.remove('err'); return; }
    exprEl.value = exprEl.value.slice(0, -1);
    moveCaretEnd();
  }

  function clearAll() {
    setExpr('');
    lastResult = null;
    resultEl.textContent = '0';
    resultEl.classList.remove('err');
    hintEl.textContent = '';
  }

  /* ---------- 平衡括号 + 计算 ---------- */
  function balanceParens(s) {
    var open = 0;
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '(') open++;
      else if (s[i] === ')') open = Math.max(0, open - 1);
    }
    while (open > 0) { s += ')'; open--; }
    return s;
  }

  function compute() {
    var expr = getExpr().trim();
    if (!expr) return;
    var t0 = performance.now();
    var res = EN.evaluate(balanceParens(expr), precision);
    var dt = (performance.now() - t0).toFixed(1);
    var isErr = res.indexOf('错误') === 0;
    resultEl.textContent = res;
    resultEl.classList.toggle('err', isErr);
    if (!isErr) {
      lastResult = res;
      pushHistory(expr, res, dt);
    } else {
      lastResult = null;
    }
    hintEl.textContent = isErr ? '请检查表达式' : ('计算用时 ' + dt + ' 毫秒 · 精度 ' + precision + ' 位');
    justEqualed = true;
  }

  function pushHistory(e, r, dt) {
    history.unshift({ e: e, r: r, t: dt });
    if (history.length > 100) history.pop();
    renderHistory();
  }
  function renderHistory() {
    var list = $('history-list');
    if (!list) return;
    list.innerHTML = '';
    history.forEach(function (h) {
      var li = document.createElement('li');
      li.innerHTML = '<div class="h-expr"></div><div class="h-res"></div>';
      li.querySelector('.h-expr').textContent = h.e;
      li.querySelector('.h-res').textContent = h.r;
      li.addEventListener('click', function () { setExpr(h.e); compute(); });
      list.appendChild(li);
    });
  }

  /* ---------- 事件绑定 ---------- */
  function bindKeys(root) {
    root.addEventListener('click', function (ev) {
      var k = ev.target.closest('.key');
      if (!k) return;
      if (k.hasAttribute('data-insert')) { insert(k.getAttribute('data-insert')); return; }
      if (k.hasAttribute('data-fn')) { insert(k.getAttribute('data-fn') + '('); return; }
      if (k.hasAttribute('data-cmd')) {
        var cmd = k.getAttribute('data-cmd');
        if (cmd === 'clear') clearAll();
        else if (cmd === 'backspace') backspace();
        else if (cmd === 'equals') compute();
        else if (cmd === 'copy') copyResult();
        else if (cmd === 'history') openOverlay('history');
        else if (cmd === 'help') openOverlay('help');
        else if (cmd === 'clear-history') { history = []; renderHistory(); }
      }
    });
  }
  ['basic-panel', 'sci-panel', 'num-panel'].forEach(function (p) {
    bindKeys(document.querySelector('.' + p));
  });

  // 面板切换
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var p = tab.getAttribute('data-panel');
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      document.querySelectorAll('.keys').forEach(function (k) { k.classList.remove('active'); });
      var panel = document.querySelector('.' + p + '-panel');
      if (panel) panel.classList.add('active');
    });
  });

  // 精度
  $('prec').addEventListener('change', function () {
    precision = parseInt($('prec').value, 10);
    EN.setPrecision(precision);
    if (getExpr().trim()) compute();
    else hintEl.textContent = '精度已设为 ' + precision + ' 位';
  });

  // 键盘
  document.addEventListener('keydown', function (ev) {
    var t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    var key = ev.key;
    if (key === 'Enter' || key === '=') { ev.preventDefault(); compute(); }
    else if (key === 'Escape') { ev.preventDefault(); clearAll(); }
    else if (key === 'Backspace') { ev.preventDefault(); backspace(); }
  });
  exprEl.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); compute(); }
  });

  // 浮层
  function openOverlay(id) { var o = $('history-overlay'); var h = $('help-overlay'); if (o) o.hidden = id !== 'history'; if (h) h.hidden = id !== 'help'; }
  function closeOverlays() { $('history-overlay').hidden = true; $('help-overlay').hidden = true; }
  document.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', closeOverlays);
  });
  ['history-overlay', 'help-overlay'].forEach(function (id) {
    $(id).addEventListener('click', function (ev) { if (ev.target === this) closeOverlays(); });
  });

  function copyResult() {
    if (resultEl.textContent && resultEl.textContent !== '0') {
      navigator.clipboard.writeText(resultEl.textContent).then(function () {
        hintEl.textContent = '已复制到剪贴板';
      }).catch(function () { hintEl.textContent = '复制失败'; });
    }
  }

  function updateHint() {
    var e = getExpr();
    hintEl.textContent = e
      ? '支持 + − × ÷ ^ √ sin cos tan ln log exp 阶乘 nCr nPr gcd …'
      : '输入或点击按钮，例如 2^100、sin(pi/2)、fact(50)';
  }

  /* ---------- WebGL 液态玻璃背景 ---------- */
  (function initBg() {
    var canvas = $('lg-background');
    if (!canvas) return;
    var gl = canvas.getContext('webgl', { antialias: false });
    if (!gl) { canvas.style.background = 'radial-gradient(60% 60% at 20% 10%, #153a63, transparent), linear-gradient(135deg,#0a0f22,#1a2a4a)'; return; }

    var vs =
      'attribute vec2 a; void main(){ gl_Position=vec4(a,0.,1.); }';
    var fs =
      'precision highp float;' +
      'uniform vec2 uRes; uniform float uTime;' +
      'float w(vec2 p, vec2 d, float f, float s){ return sin(dot(p,d)*f+uTime*s); }' +
      'void main(){' +
      ' vec2 p = gl_FragCoord.xy / uRes.xy;' +
      ' float w1 = w(p, vec2(1.0,0.6), 3.0, 0.6);' +
      ' float w2 = w(p, vec2(0.4,-1.0), 5.0, 0.9);' +
      ' vec2 q = p + vec2(w1,w2)*0.07;' +
      ' float n1 = w(q, vec2(1.3,0.8), 6.0, 0.5);' +
      ' float n2 = w(q, vec2(0.7,-1.2), 8.0, 0.7);' +
      ' float n3 = w(q*1.5, vec2(-1.0,0.5), 10.0, 1.0);' +
      ' float v = n1*0.5 + n2*0.3 + n3*0.2;' +
      ' vec3 c1 = vec3(0.04,0.18,0.42);' +
      ' vec3 c2 = vec3(0.0,0.5,0.72);' +
      ' vec3 c3 = vec3(0.32,0.13,0.58);' +
      ' vec3 col = mix(c1,c2, 0.5+0.5*sin(v*3.14));' +
      ' col = mix(col, c3, 0.5+0.5*sin(v*2.0+1.0));' +
      ' float d = length((p-0.5)*vec2(uRes.x/uRes.y,1.0));' +
      ' col *= 1.0 - 0.42*smoothstep(0.4,1.0,d);' +
      ' gl_FragColor = vec4(col, 1.0);' +
      '}';

    function compile(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var a = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, 'uRes');
    var uTime = gl.getUniformLocation(prog, 'uTime');

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);

    var start = performance.now();
    (function frame() {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(frame);
    })();
  })();
})();
