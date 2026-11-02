<?php
namespace Shop;
trait TracksEvents {
    public function emit(): void {}
}
class Order {
    use TracksEvents { emit as notify; }
    public function save(): void { $this->missing(); }
}
